<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\PlacesByMac;
use App\Models\AirConditioner;
use App\Models\Room;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Events\LiveReadingCreated;

class AirConditionerController extends Controller
{
    use PlacesByMac;

    public function index()
    {
        return response()->json(AirConditioner::orderBy('id')->get());
    }

    /**
     * Called by the Pi after a network scan.
     *
     * Units are matched on MAC and never deleted, so user settings
     * (name, target_temp, enabled) survive a rescan. Units missing from the
     * scan are flagged offline instead of being removed.
     */
    public function sync(Request $request)
    {
        $payload = $request->validate([
            'devices' => 'present|array',
            'devices.*.mac' => 'required|string|max:32',
            'devices.*.name' => 'required|string|max:64',
            'devices.*.ip' => 'required|ip',
            'devices.*.port' => 'nullable|integer|between:1,65535',
            'devices.*.reported_temp' => 'nullable|numeric|between:-20,60',
            // Sent only by the live poller, which reads the unit without
            // commanding it. Absent from a discovery sync, hence nullable.
            'devices.*.reported_state' => 'nullable|array',
            // Sent only when the Pi has concluded a person switched this unit
            // themselves. Absent on every other sync, which is why it is
            // nullable rather than defaulted.
            'devices.*.manual_power' => 'nullable|boolean',
        ]);

        $seenIds = [];
        $changed = false;

        foreach ($payload['devices'] as $device) {
            $ac = AirConditioner::firstOrNew(['mac' => $device['mac']]);

            $ac->ip = $device['ip'];
            $ac->port = $device['port'] ?? 7000;
            $ac->online = true;

            if (array_key_exists('reported_temp', $device) && $device['reported_temp'] !== null) {
                $ac->reported_temp = $device['reported_temp'];
                $ac->reported_at = now();
            }

            if (! empty($device['reported_state'])) {
                $ac->observed_state = $this->knownObservationKeys($device['reported_state']);
                $ac->observed_at = now();

                // The unit is the authority on its own settings, whoever
                // changed them. Nothing here corrects it; we take what it says.
                $ac->adoptObservedSettings();

                // Only when something actually moved. Broadcasting an
                // observation used to be unthinkable -- the Pi read the
                // document, found a difference and commanded on it, so telling
                // it what a unit was doing was telling it to change something.
                // It commands on being asked now, so this is just news, and
                // waiting for the dashboard's own poll on top of the Pi's cost
                // half a minute for something already known.
                // Both evaluated before either is tested. Folding them into one
                // condition lets || short-circuit, and the setpoint is then
                // never adopted on any pass where a setting changed as well.
                $settingsMoved = $ac->isDirty(array_keys(AirConditioner::ADOPTED));
                $setpointMoved = $this->adoptSetpoint($ac);

                if ($settingsMoved || $setpointMoved) {
                    $changed = true;
                }
            }

            // Unlike the observation, this changes what the unit is *for*, so
            // it has to reach the Pi: the control document is what stops the
            // re-assert switching the unit straight back.
            if (array_key_exists('manual_power', $device) && $device['manual_power'] !== null) {
                if ($ac->manual_power !== (bool) $device['manual_power']) {
                    $changed = true;
                }

                $ac->manual_power = (bool) $device['manual_power'];
                $ac->manual_since = now();
            }

            // Only seed the name on first discovery, so a rename in the UI sticks.
            if (! $ac->exists) {
                $ac->name = $device['name'];
            }

            // A unit is bolted to a wall, so where it lives is configuration, not
            // a choice. Only fills a gap: an assignment made in the UI stands.
            if ($ac->room_id === null) {
                $ac->room_id = $this->configuredRoomId($device['mac'], 'climate.ac_rooms');
            }

            // last_seen_at changes on every scan, so it must not by itself
            // trigger a broadcast or the Pi loops on the result of its own sync.
            if ($ac->isDirty(['ip', 'port', 'online', 'name', 'room_id'])) {
                $changed = true;
            }

            $ac->last_seen_at = now();
            $ac->save();

            $seenIds[] = $ac->id;
        }

        $wentOffline = AirConditioner::whereNotIn('id', $seenIds)
            ->where('online', true)
            ->update(['online' => false]);

        // Rooms reading their temperature off a Gree unit depend on this sync.
        Room::where('temp_source', 'ac')->get()->each->refreshCurrentTemp();

        if ($changed || $wentOffline > 0) {
            event(new LiveReadingCreated(null));
        }

        return response()->json([
            'message' => 'Sync successful',
            'synced' => count($seenIds),
            'offline' => $wentOffline,
        ]);
    }

    /**
     * Keep only the keys we know how to read.
     *
     * The Pi is trusted, but a column that stores whatever it was handed grows
     * whatever greeclimate happens to expose next, and every reader downstream
     * inherits the surprise. An allowlist keeps the shape ours.
     *
     * @return array<string, mixed>
     */
    private function knownObservationKeys(array $reported): array
    {
        return array_intersect_key($reported, array_flip([
            'power', 'mode', 'target_temp', 'fan_speed',
            'swing_v', 'swing_h', 'xfan', 'quiet', 'turbo',
        ]));
    }

    /**
     * Take the room's setpoint from the unit that is holding it.
     *
     * The setpoint lives on the room rather than the unit, so this is the one
     * adopted value written somewhere shared -- which is why it is fussier
     * about when it will do it.
     */
    private function adoptSetpoint(AirConditioner $ac): bool
    {
        $observed = $ac->freshObservation();

        if ($observed === null || $ac->awaiting) {
            return false;
        }

        // Only a running unit knows its setpoint: an idle Gree reports whatever
        // it was last left with, which is why the stored value is worth
        // keeping -- it is what the unit gets started with next time, by
        // whoever starts it.
        //
        // Fan mode counts. The unit is not acting on the setpoint there, but it
        // is still holding one, and it is the one it will act on the moment the
        // mode changes. Excluding it meant the number on the card was wrong for
        // precisely the mode you would choose to change settings in without
        // starting the compressor.
        if (empty($observed['power'])) {
            return false;
        }

        $target = $observed['target_temp'] ?? null;
        $room = $ac->room;

        if ($target === null || ! $room || (float) $room->target_temp === (float) $target) {
            return false;
        }

        // One room, one setpoint, so a second running unit would have us
        // alternating between two answers forever. With one, the unit is simply
        // telling us what the room is set to.
        $others = $room->airConditioners()
            ->where('id', '!=', $ac->id)
            ->get()
            ->filter(fn (AirConditioner $other) => $other->observed_power);

        if ($others->isNotEmpty()) {
            return false;
        }

        $room->forceFill(['target_temp' => (float) $target])->save();

        return true;
    }

    public function update(Request $request, $id)
    {
        $ac = AirConditioner::findOrFail($id);

        // `mode` is house-level (system_states.mode) and is not settable per unit.
        $data = $request->validate([
            'room_id' => 'sometimes|nullable|integer|exists:rooms,id',
            'name' => 'sometimes|string|max:64',
            'target_temp' => 'sometimes|integer|between:16,30',
            'enabled' => 'sometimes|boolean',
            'heating_on' => 'sometimes|boolean',
            'cooling_on' => 'sometimes|boolean',
            'calibration_offset' => 'sometimes|numeric|between:-10,10',
            'fan_speed' => ['sometimes', Rule::in(AirConditioner::FAN_SPEEDS)],
            'swing_vertical' => ['sometimes', Rule::in(AirConditioner::SWING_VERTICAL)],
            'swing_horizontal' => ['sometimes', Rule::in(AirConditioner::SWING_HORIZONTAL)],
            'xfan' => 'sometimes|boolean',
            'quiet' => 'sometimes|boolean',
            'turbo' => 'sometimes|boolean',
        ]);

        $ac->fill($data);

        // The unit cannot hold both, so switching one on releases the other
        // here rather than leaving the pair to be resolved by whichever
        // property greeclimate happens to write last.
        if (! empty($data['quiet'])) {
            $ac->turbo = false;
        }

        if (! empty($data['turbo'])) {
            $ac->quiet = false;
        }

        if (! $ac->isDirty()) {
            return response()->json($ac);
        }

        $previousRoomId = $ac->getOriginal('room_id');

        // The one thing that makes the Pi speak to a unit. It commands when
        // this moves and at no other time, so a reading can never become an
        // instruction and a handset change is never argued with.
        if ($ac->isDirty(array_keys(AirConditioner::ADOPTED))) {
            $ac->commanded_at = now();

            // A fresh ask on these, so last time's verdict no longer applies.
            $ac->rejected_settings = array_values(
                array_diff($ac->rejected, array_keys($ac->getDirty()))
            ) ?: null;
        }

        // Touching this unit in the app is the gesture that asks for automatic
        // control back. Requiring a separate button for it would leave people
        // pressing things and watching nothing happen.
        $ac->manual_power = null;
        $ac->manual_since = null;

        $ac->save();

        // Reassignment changes which unit feeds a room that sources its
        // temperature from an AC, so both sides have to be recomputed.
        foreach (array_unique(array_filter([$previousRoomId, $ac->room_id])) as $roomId) {
            Room::find($roomId)?->refreshCurrentTemp();
        }

        event(new LiveReadingCreated(null));

        return response()->json($ac->fresh());
    }
}

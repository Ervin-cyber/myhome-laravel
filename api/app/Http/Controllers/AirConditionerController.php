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
            'devices.*.reported_power' => 'nullable|boolean',
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

            // Deliberately not folded into the $changed check below: what the
            // unit is doing is for the dashboard to read on its next poll, and
            // broadcasting it would put the Pi's own observation back on the
            // channel the Pi diffs.
            if (array_key_exists('reported_power', $device) && $device['reported_power'] !== null) {
                $ac->observed_power_on = (bool) $device['reported_power'];
                $ac->observed_at = now();
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

<?php

namespace App\Http\Controllers;

use App\Models\AirConditioner;
use App\Models\Room;
use Illuminate\Http\Request;
use App\Events\LiveReadingCreated;

class AirConditionerController extends Controller
{
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

            // Only seed the name on first discovery, so a rename in the UI sticks.
            if (! $ac->exists) {
                $ac->name = $device['name'];
            }

            // A unit is bolted to a wall, so where it lives is configuration, not
            // a choice. Only fills a gap: an assignment made in the UI stands.
            if ($ac->room_id === null) {
                $ac->room_id = $this->configuredRoomId($device['mac']);
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
     * Room a unit belongs to according to config/climate.php, or null if the
     * MAC is not one we know about.
     *
     * Gree units report their MAC unseparated and lower-cased, but a hand-typed
     * config entry may well have colons in it, so both sides are normalised.
     */
    private function configuredRoomId(string $mac): ?int
    {
        $normalise = fn (string $value) => strtolower(preg_replace('/[^0-9a-fA-F]/', '', $value));

        $map = collect(config('climate.ac_rooms', []))
            ->mapWithKeys(fn ($slug, $key) => [$normalise((string) $key) => $slug]);

        $slug = $map->get($normalise($mac));

        return $slug ? Room::where('slug', $slug)->value('id') : null;
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
        ]);

        $ac->fill($data);

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

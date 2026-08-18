<?php

namespace App\Http\Controllers;

use App\Events\LiveReadingCreated;
use App\Http\Controllers\Concerns\PlacesByMac;
use App\Models\SmartPlug;
use Illuminate\Http\Request;

class SmartPlugController extends Controller
{
    use PlacesByMac;

    public function index()
    {
        return response()->json(SmartPlug::climate());
    }

    /**
     * Called by the Pi after reading its plugs.
     *
     * Plugs are matched on MAC and never deleted, so a rename or a room chosen
     * in the dashboard survives a rescan and a new DHCP lease. Only the latest
     * values are kept: the plug keeps its own history and its own daily total,
     * and there is no reason to mirror either onto the Pi's card.
     */
    public function sync(Request $request)
    {
        $payload = $request->validate([
            'plugs' => 'present|array',
            'plugs.*.mac' => 'required|string|max:32',
            'plugs.*.name' => 'required|string|max:64',
            'plugs.*.ip' => 'nullable|ip',
            'plugs.*.watts' => 'nullable|numeric|between:0,10000',
            'plugs.*.energy_today' => 'nullable|numeric|between:0,100000',
        ]);

        $seenIds = [];
        $changed = false;

        foreach ($payload['plugs'] as $reported) {
            // Everything on the TP-Link account answers, including plugs that
            // meter a desk rather than a compressor. Dropping them here keeps
            // them out of the table entirely rather than storing readings
            // nothing will ever display.
            if (! SmartPlug::macIsClimate($reported['mac'])) {
                continue;
            }

            $plug = SmartPlug::firstOrNew(['mac' => $reported['mac']]);

            $plug->ip = $reported['ip'] ?? $plug->ip;
            $plug->online = true;

            // Only seed the name on first discovery, so a rename in the UI sticks.
            if (! $plug->exists) {
                $plug->name = $reported['name'];
                $changed = true;
            }

            if ($plug->room_id === null) {
                $plug->room_id = $this->configuredRoomId($reported['mac'], 'climate.plug_rooms');
            }

            if (($reported['watts'] ?? null) !== null) {
                $plug->watts = (float) $reported['watts'];
                $plug->watts_at = now();
            }

            if (($reported['energy_today'] ?? null) !== null) {
                $plug->energy_today = (float) $reported['energy_today'];
            }

            $plug->last_seen_at = now();
            $plug->save();

            $seenIds[] = $plug->id;
        }

        // A plug that has dropped off the network reports nothing, which must
        // never be read as "nothing is drawing power". Clearing the value is
        // what makes the difference visible rather than showing a stale number.
        $wentOffline = SmartPlug::whereNotIn('id', $seenIds)
            ->where('online', true)
            ->update(['online' => false, 'watts' => null]);

        // Wattage moves constantly, so a broadcast per sync would be noise on
        // a channel the Pi diffs. The dashboard polls for live figures; only
        // a plug appearing or vanishing is worth waking everyone up for.
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
        $plug = SmartPlug::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:64',
            // Null keeps the plug house-wide, which is what a plug feeding
            // more than one room has to be.
            'room_id' => 'sometimes|nullable|integer|exists:rooms,id',
        ]);

        $plug->fill($data);

        if ($plug->isDirty()) {
            $plug->save();
            event(new LiveReadingCreated(null));
        }

        return response()->json($plug->fresh());
    }
}

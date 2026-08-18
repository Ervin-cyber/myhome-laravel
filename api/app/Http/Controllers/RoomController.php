<?php

namespace App\Http\Controllers;

use App\Events\LiveReadingCreated;
use App\Models\Room;
use App\Models\SystemState;
use App\Services\ClimateService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoomController extends Controller
{
    /** Boost durations offered by the dashboard, in minutes. */
    private const BOOST_MINUTES = [15, 30, 60];

    public function index()
    {
        return response()->json(
            Room::with('airConditioners')->orderBy('sort_order')->get()
        );
    }

    /**
     * Open a window during which the Pi interrogates the units directly, so an
     * open dashboard shows what they actually report rather than what we last
     * told them. Expires on its own, so a closed tab stops the polling.
     */
    public function live()
    {
        return response()->json([
            'live_until' => ClimateService::requestLiveData(),
            'window' => ClimateService::LIVE_WINDOW_SECONDS,
        ]);
    }

    /**
     * Run this room now, opening every gate between the press and cold air.
     *
     * A unit only runs when the house is on, the room is on and the unit itself
     * is enabled. The room switch used to write the middle one alone, so it
     * could sit lit while nothing happened, with no indication of which of the
     * other two was holding it shut. This settles all three in one write.
     *
     * Switching a room off stays local: it releases the room and nothing else,
     * because stopping one room must never stop the house.
     *
     * The house heat/cool decision is deliberately untouched. It is seasonal
     * and shared, and a room button that flipped it would have one room
     * silently undo the other.
     */
    public function run(Request $request, $id)
    {
        $room = Room::with('airConditioners')->findOrFail($id);

        $on = $request->boolean('on', true);

        $room->enabled = $on;

        // Off means off. A boost outranks the house switch by design, so
        // leaving it standing here would have the button turn the room off and
        // the room carry on regardless.
        if (! $on) {
            $room->hvac_until = 0;
        }

        if ($room->isDirty()) {
            $room->save();
        }

        if ($on) {
            $state = SystemState::first();

            if ($state && ! $state->enabled) {
                $state->enabled = true;
                $state->save();
            }

            // Also the only route back for a unit parked while the toggle for
            // it was still on screen, now that the dashboard no longer shows one.
            $room->airConditioners()->where('enabled', false)->update(['enabled' => true]);
        }

        event(new LiveReadingCreated(null));

        return response()->json($room->fresh('airConditioners'));
    }

    public function update(Request $request, $id)
    {
        $room = Room::findOrFail($id);

        $data = $request->validate([
            'name' => 'sometimes|string|max:64',
            'target_temp' => 'sometimes|numeric|between:10,30',
            'enabled' => 'sometimes|boolean',
            // Minutes from the boost buttons, or 0 to cancel.
            'hvac_until' => 'sometimes|integer|min:0',
            'calibration_offset' => 'sometimes|numeric|between:-10,10',
            // Null hands the room back to the house heat/cool decision.
            'mode_override' => ['sometimes', 'nullable', Rule::in(Room::MODE_OVERRIDES)],
        ]);

        if (array_key_exists('hvac_until', $data)) {
            $data['hvac_until'] = $this->resolveBoost($data['hvac_until']);
        }

        $room->fill($data);

        if (! $room->isDirty()) {
            return response()->json($room->fresh('airConditioners'));
        }

        $room->save();

        event(new LiveReadingCreated(null));

        return response()->json($room->fresh('airConditioners'));
    }

    /**
     * The dashboard sends a duration in minutes; anything else is treated as an
     * already-resolved timestamp, and an implausible one cancels the boost.
     */
    private function resolveBoost(int $value): int
    {
        if ($value === 0) {
            return 0;
        }

        if (in_array($value, self::BOOST_MINUTES, true)) {
            return time() + ($value * 60);
        }

        return $value > (time() + 7210) ? 0 : $value;
    }
}

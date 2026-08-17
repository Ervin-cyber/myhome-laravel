<?php

namespace App\Http\Controllers;

use App\Events\LiveReadingCreated;
use App\Models\Room;
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

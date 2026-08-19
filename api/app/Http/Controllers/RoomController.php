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
    /**
     * Durations the dashboard offers, in minutes.
     *
     * Both sets, because the two machines are used on different timescales: a
     * radiator top-up is a quarter of an hour, an air conditioner is put on for
     * an evening. Which set is shown is the dashboard's business; this only has
     * to recognise anything it might send.
     */
    private const BOOST_MINUTES = [15, 30, 60, 120];

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
        $until = ClimateService::requestLiveData();

        // The window only reaches the Pi inside a control document, so without
        // this it waited for the next sensor reading to be broadcast before it
        // started polling at all — most of a five-minute window could lapse
        // before the first live reading was taken. Costs nothing at the far
        // end: the Pi's diff ignores live_until, so no unit is commanded.
        event(new LiveReadingCreated(null));

        return response()->json([
            'live_until' => $until,
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

        // Either way, this room is being driven from the app again, so a unit
        // somebody had switched by hand stops overriding the loop. Without
        // this, pressing the room on would do nothing to a unit switched off at
        // the handset -- which is precisely the confusion the manual override
        // was added to prevent, arriving from the other side.
        $room->airConditioners()->whereNotNull('manual_power')
            ->update(['manual_power' => null, 'manual_since' => null]);

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

        // Driving the room from the app takes it back off the handset. Only for
        // the fields that are actually instructions to the hardware -- renaming
        // a room or trimming its sensor calibration is not one.
        if ($room->isDirty(['enabled', 'hvac_until', 'mode_override', 'target_temp'])) {
            $room->airConditioners()->whereNotNull('manual_power')
                ->update(['manual_power' => null, 'manual_since' => null]);
        }

        // The setpoint and the mode live on the room but are carried out by
        // its units, and the Pi only speaks when it has been asked to -- so the
        // ask has to be recorded on the units themselves or nothing reaches
        // the hardware.
        if ($room->isDirty(['target_temp', 'mode_override'])) {
            $room->airConditioners()->update(['commanded_at' => now()]);
        }

        // Starting a boost is "run this room now", the same sentence the room's
        // power button says, so it clears the same things out of the way. A
        // parked unit ignoring boost while answering the button above it was
        // two gestures meaning one thing and behaving differently.
        if ($room->isDirty('hvac_until') && $room->hvac_until > time()) {
            $room->airConditioners()->where('enabled', false)->update(['enabled' => true]);

            // The same button means two things, because the two machines are
            // used differently. On the boiler it is "heat for fifteen more
            // minutes", and the room goes back to its thermostat afterwards. On
            // an air conditioner it is a run timer: fifteen minutes and then
            // off.
            //
            // Clearing `enabled` is the whole mechanism. is_boosting holds the
            // room active for the duration on its own, so when it lapses there
            // is nothing left keeping the room on and it stops.
            if ($this->boostIsATimer($room)) {
                $room->enabled = false;
            }
        }

        $room->save();

        event(new LiveReadingCreated(null));

        return response()->json($room->fresh('airConditioners'));
    }

    /**
     * Whether a boost on this room ends with the room off.
     *
     * True when an air conditioner is what would answer it. Radiators are used
     * to top a room up and leave it under its thermostat; a split is put on for
     * a while and then wanted off, and expecting one button to be read both
     * ways is what made a fifteen-minute boost run indefinitely.
     */
    private function boostIsATimer(Room $room): bool
    {
        if (! $room->airConditioners()->exists()) {
            return false;
        }

        $houseMode = SystemState::first()?->mode ?? 'heating';

        // heat, unless the room has overridden to dry or fan, or it is summer.
        $unitMode = $room->unitMode($houseMode);

        return $unitMode !== 'heat' || $room->heat_source === 'ac';
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

        // Anything else is treated as an already-resolved timestamp. A minute
        // of slack past the longest duration we offer, so a clock that has
        // drifted slightly does not silently cancel a boost that just started.
        $ceiling = time() + (max(self::BOOST_MINUTES) * 60) + 60;

        return $value > $ceiling ? 0 : $value;
    }
}

<?php

namespace App\Services;

use App\Models\AirConditioner;
use App\Models\Room;
use App\Models\SystemState;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Decides what every actuator in the house should be doing.
 *
 * This is the only place the thermostat logic lives. The Pi does not decide
 * anything: it receives the document produced here and applies it, so the
 * dashboard, the API and the hardware can never disagree about intent.
 */
class ClimateService
{
    /** Deadband around a setpoint, in °C. */
    public const TOLERANCE = 0.2;

    /**
     * How far the wrong side of its setpoint a room has to be before its unit
     * is switched off outright, in °C.
     *
     * An inverter split regulates itself better than we can from outside: the
     * compressor varies its speed, and a start costs far more in wear and
     * power than a long idle. So we hand the unit a setpoint and leave it
     * alone, and only cut power when there is genuinely nothing left to
     * regulate towards — never on a small overshoot.
     */
    public const IDLE_MARGIN = 2.0;

    /**
     * The configured margin, or null when we are not to decide this at all.
     *
     * Null hands the whole question to the unit: it keeps power while its room
     * is on, and regulates itself from the setpoint and mode we give it. That
     * is a legitimate way to run the system rather than a degraded one -- an
     * inverter is better at holding a room than we are from outside, and it
     * cannot be fooled by a sensor sitting in its own discharge air.
     */
    private function idleMargin(): ?float
    {
        $configured = config('climate.idle_margin', self::IDLE_MARGIN);

        return $configured === null ? null : (float) $configured;
    }

    /**
     * A compressor that is restarted immediately after stopping will fail
     * early, so a unit stays off for at least this long once switched off.
     */
    public const AC_MIN_OFF_SECONDS = 180;

    /** How long the Pi may keep acting on a document before failing safe. */
    public const CONTROL_TTL_SECONDS = 300;

    /** How long an open dashboard keeps the Pi polling the units. */
    public const LIVE_WINDOW_SECONDS = 300;

    private const LIVE_CACHE_KEY = 'climate.live_until';

    /** Readings outside this range are treated as a broken sensor. */
    private const PLAUSIBLE_MIN = 5.0;
    private const PLAUSIBLE_MAX = 50.0;

    /**
     * What a Gree will accept as a setpoint. The protocol carries Celsius as a
     * whole-degree integer, and the unit rejects anything outside this band —
     * whereas the boiler is regulated by us and can chase any target it likes.
     */
    public const AC_TEMP_MIN = 16;
    public const AC_TEMP_MAX = 30;

    /**
     * Evaluate the whole house and persist the resulting per-zone state.
     *
     * Only rooms and air conditioners are written here. Writing SystemState
     * would re-enter the broadcast that triggered this evaluation.
     */
    public function evaluate(): array
    {
        $state = SystemState::first();
        $rooms = Room::with('airConditioners')->orderBy('sort_order')->get();

        $mode = $state?->mode ?? 'heating';
        $masterOn = (bool) ($state?->enabled ?? false);

        $boiler = $mode === 'heating'
            ? $this->boilerDemand($rooms, $state, $masterOn)
            : false;

        $units = [];

        foreach ($rooms as $room) {
            $roomUnits = $this->commandsForRoom($room, $mode, $masterOn);
            $units = array_merge($units, $roomUnits);

            $this->persistRoomState(
                $room,
                heating: $boiler && $room->heat_source === 'boiler' && $this->isRoomActive($room, $masterOn),
                cooling: collect($roomUnits)->contains(
                    fn ($u) => $u['power'] && in_array($u['mode'], ['cool', 'dry'], true)
                ),
            );
        }

        // Units nobody has assigned to a room yet still follow the house so the
        // system keeps working during setup, using their own setpoint.
        foreach (AirConditioner::whereNull('room_id')->get() as $ac) {
            $units[] = $this->unitCommand(
                $ac,
                power: $masterOn && $mode === 'cooling' && $ac->enabled,
                mode: 'cool',
                target: (float) $ac->target_temp,
            );
        }

        return [
            'v' => 3,
            'boiler' => $boiler,
            'units' => $units,
            'live_until' => self::liveUntil(),
            'expires_at' => time() + self::CONTROL_TTL_SECONDS,
        ];
    }

    /**
     * Ask the Pi to poll the units frequently for the next few minutes.
     *
     * Gree units are only worth interrogating while somebody is watching: the
     * chatter is pointless otherwise, and it competes with the commands we
     * actually care about. The window expires on its own so a closed tab, a
     * crashed browser or a lost connection all stop the polling by default.
     */
    public static function requestLiveData(): int
    {
        $until = time() + self::LIVE_WINDOW_SECONDS;

        Cache::put(self::LIVE_CACHE_KEY, $until, self::LIVE_WINDOW_SECONDS);

        return $until;
    }

    public static function liveUntil(): int
    {
        return (int) Cache::get(self::LIVE_CACHE_KEY, 0);
    }

    /**
     * A room acts on its own account: the master switch gates the rooms that
     * are merely enabled, but a boost stands on its own. Boosting one room
     * must never wake the others.
     */
    private function isRoomActive(Room $room, bool $masterOn): bool
    {
        return ($masterOn && $room->enabled) || $room->is_boosting;
    }

    /**
     * One boiler, one relay, so a single reference room regulates it. Any
     * boiler-heated room that is boosting can additionally force it on.
     */
    private function boilerDemand(Collection $rooms, ?SystemState $state, bool $masterOn): bool
    {
        $boosting = $rooms->contains(
            fn (Room $room) => $room->heat_source === 'boiler' && $room->is_boosting
        );

        if ($boosting) {
            return true;
        }

        $reference = $rooms->firstWhere('drives_boiler', true);

        if (! $reference || ! $this->isRoomActive($reference, $masterOn)) {
            return false;
        }

        return $this->demandsHeat(
            $reference->current_temp,
            (float) $reference->target_temp,
            currentlyOn: (bool) ($state?->heating_on ?? false),
        );
    }

    /**
     * Hysteresis around the setpoint. Both directions return false whenever the
     * reading is missing or implausible: acting on a guess is worse than idling.
     */
    private function demandsHeat(?float $temp, float $target, bool $currentlyOn, float $tolerance = self::TOLERANCE): bool
    {
        if (! $this->isPlausible($temp)) {
            return false;
        }

        return $currentlyOn
            ? $temp < ($target + $tolerance)
            : $temp <= ($target - $tolerance);
    }

    private function isPlausible(?float $temp): bool
    {
        return $temp !== null && $temp > self::PLAUSIBLE_MIN && $temp < self::PLAUSIBLE_MAX;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function commandsForRoom(Room $room, string $mode, bool $masterOn): array
    {
        $unitMode = $room->unitMode($mode);

        $power = $this->isRoomActive($room, $masterOn)
            && $this->unitHasWork($room, $unitMode, $room->is_boosting);

        return $room->airConditioners
            ->map(fn (AirConditioner $ac) => $this->unitCommand(
                $ac,
                // A person at the handset outranks the thermostat. Switching a
                // unit off by hand and having the house switch it back on a
                // minute later is not a control loop, it is an argument. Held
                // until somebody uses the app, which is the same gesture as
                // asking for automatic control back.
                power: $ac->manual_power ?? ($ac->enabled && $power),
                mode: $unitMode,
                // The room owns the setpoint; every unit in it shares one target.
                target: (float) $room->target_temp,
            ))
            ->all();
    }

    /**
     * Whether this room's units have anything to do at all.
     *
     * Deliberately not a thermostat. The unit's own inverter is the better
     * regulator, so the question here is only whether to hand it the room or
     * not — see IDLE_MARGIN.
     */
    private function unitHasWork(Room $room, string $unitMode, bool $boosting): bool
    {
        // Dry and fan are comfort choices, not calls for heating or cooling.
        if (in_array($unitMode, Room::MODE_OVERRIDES, true)) {
            return true;
        }

        // A room with radiators leaves its unit idle all winter, boost or not:
        // boosting such a room is a call for heat, and the boiler answers it.
        if ($unitMode === 'heat' && $room->heat_source !== 'ac') {
            return false;
        }

        // Somebody has asked for this room, now. The test below is a judgement
        // about whether the unit is worth running, and a person pressing a
        // button has already made it — the boiler has always been read this
        // way, and the same press starting nothing at all on an AC was the
        // inconsistency rather than the safeguard.
        if ($boosting) {
            return true;
        }

        // A room that reads its temperature off the unit goes blind the moment
        // that unit stops: the reading would freeze at the value that caused
        // the switch-off and nothing would ever ask it to start again. Those
        // rooms are never switched off on temperature.
        if ($room->temp_source === 'ac') {
            return true;
        }

        return ! $this->isBeyondReach($room->current_temp, (float) $room->target_temp, $unitMode);
    }

    /**
     * True when the room sits so far the wrong side of its setpoint that the
     * unit has nothing left to do — 20°C in a room asking to be cooled to 24°C.
     *
     * A missing or implausible reading returns false, leaving the unit running:
     * with no reading of our own, the split's internal sensor is the better
     * judge. That is the opposite of the boiler's bias, and deliberately so —
     * an idling compressor is a small waste, an unattended boiler is not.
     */
    private function isBeyondReach(?float $temp, float $target, string $unitMode): bool
    {
        $margin = $this->idleMargin();

        // Configured off: the unit keeps its room and regulates itself.
        if ($margin === null) {
            return false;
        }

        if (! $this->isPlausible($temp)) {
            return false;
        }

        return $unitMode === 'cool'
            ? $temp < ($target - $margin)
            : $temp > ($target + $margin);
    }

    /**
     * @return array<string, mixed>
     */
    private function unitCommand(AirConditioner $ac, bool $power, string $mode, float $target): array
    {
        // Fan mode never starts the compressor, so it is not held back by it.
        // Nor is a unit somebody has just switched on themselves: the guard
        // exists to stop us short-cycling a compressor, not to overrule a
        // person standing in front of it with a remote.
        if ($power && $mode !== 'fan' && ! $ac->following_remote && $this->isCoolingDown($ac)) {
            $power = false;
        }

        $this->persistUnitState($ac, $power, $mode, $target);

        return [
            'mac' => $ac->mac,
            'ip' => $ac->ip,
            'name' => $ac->name,
            'port' => $ac->port,
            'power' => $power,
            'mode' => $mode,
            'target_temp' => $this->unitSetpoint($target),
            'fan_speed' => $ac->fan_speed,
            'swing_v' => $ac->swing_vertical,
            'swing_h' => $ac->swing_horizontal,
            // Gree dries its own coil after cooling; we only set the flag.
            'xfan' => (bool) $ac->xfan,
            // Sent even when false. Both override fan_speed at the unit, so
            // leaving them unwritten lets one set from the handset pin the fan
            // indefinitely — which is exactly what it did.
            'quiet' => (bool) $ac->quiet,
            'turbo' => (bool) $ac->turbo,
        ];
    }

    /**
     * A room target expressed as something a Gree can actually be set to.
     *
     * A room may legitimately ask for 12°C or 21.5°C — the boiler can chase
     * either — but the unit cannot, so the value is squared up here rather
     * than being sent as-is and silently mangled by the unit.
     */
    private function unitSetpoint(float $target): int
    {
        return (int) max(self::AC_TEMP_MIN, min(self::AC_TEMP_MAX, round($target)));
    }

    private function isCoolingDown(AirConditioner $ac): bool
    {
        if ($ac->power_on || ! $ac->power_changed_at) {
            return false;
        }

        return $ac->power_changed_at->diffInSeconds(now()) < self::AC_MIN_OFF_SECONDS;
    }

    private function persistUnitState(AirConditioner $ac, bool $power, string $mode, float $target): void
    {
        $wasOn = (bool) $ac->power_on;

        // Dry runs the compressor too, so it counts as cooling for the
        // dashboard and for the min-off guard. Fan moves air and nothing else,
        // which is why power_on is tracked separately from either of these.
        $ac->power_on = $power;
        $ac->cooling_on = $power && in_array($mode, ['cool', 'dry'], true);
        $ac->heating_on = $power && $mode === 'heat';
        $ac->mode = $mode;
        $ac->target_temp = $this->unitSetpoint($target);

        if ($wasOn !== $power) {
            $ac->power_changed_at = now();
        }

        if ($ac->isDirty()) {
            $ac->save();
        }
    }

    private function persistRoomState(Room $room, bool $heating, bool $cooling): void
    {
        $room->heating_on = $heating;
        $room->cooling_on = $cooling;

        if ($room->isDirty()) {
            $room->save();
        }
    }
}

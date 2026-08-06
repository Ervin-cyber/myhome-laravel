<?php

namespace App\Services;

use App\Models\AirConditioner;
use App\Models\Room;
use App\Models\SystemState;
use Illuminate\Support\Collection;

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
     * A compressor that is restarted immediately after stopping will fail
     * early, so a unit stays off for at least this long once switched off.
     */
    public const AC_MIN_OFF_SECONDS = 180;

    /** How long the Pi may keep acting on a document before failing safe. */
    public const CONTROL_TTL_SECONDS = 300;

    /** Readings outside this range are treated as a broken sensor. */
    private const PLAUSIBLE_MIN = 5.0;
    private const PLAUSIBLE_MAX = 50.0;

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
        $systemActive = $this->isSystemActive($state, $rooms);

        $boiler = $mode === 'heating' && $systemActive
            ? $this->boilerDemand($rooms, $state)
            : false;

        $units = [];

        foreach ($rooms as $room) {
            $roomUnits = $this->commandsForRoom($room, $mode, $systemActive);
            $units = array_merge($units, $roomUnits);

            $this->persistRoomState(
                $room,
                heating: $boiler && $room->heat_source === 'boiler' && $room->isActive(),
                cooling: collect($roomUnits)->contains(fn ($u) => $u['power'] && $u['mode'] === 'cool'),
            );
        }

        // Units nobody has assigned to a room yet still follow the house so the
        // system keeps working during setup, using their own setpoint.
        foreach (AirConditioner::whereNull('room_id')->get() as $ac) {
            $units[] = $this->unitCommand(
                $ac,
                power: $systemActive && $mode === 'cooling' && $ac->enabled,
                mode: 'cool',
                target: (float) $ac->target_temp,
            );
        }

        return [
            'v' => 2,
            'boiler' => $boiler,
            'units' => $units,
            'expires_at' => time() + self::CONTROL_TTL_SECONDS,
        ];
    }

    /**
     * The house acts when the master switch is on, or while any room boosts.
     */
    private function isSystemActive(?SystemState $state, Collection $rooms): bool
    {
        if ($state?->enabled) {
            return true;
        }

        return $rooms->contains(fn (Room $room) => $room->is_boosting);
    }

    /**
     * One boiler, one relay, so a single reference room regulates it. Any
     * boiler-heated room that is boosting can additionally force it on.
     */
    private function boilerDemand(Collection $rooms, ?SystemState $state): bool
    {
        $boosting = $rooms->contains(
            fn (Room $room) => $room->heat_source === 'boiler' && $room->is_boosting
        );

        if ($boosting) {
            return true;
        }

        $reference = $rooms->firstWhere('drives_boiler', true);

        if (! $reference || ! $reference->enabled) {
            return false;
        }

        return $this->thermostat(
            $reference->current_temp,
            (float) $reference->target_temp,
            currentlyOn: (bool) ($state?->heating_on ?? false),
        );
    }

    /**
     * Hysteresis around the setpoint. Returns false whenever the reading is
     * missing or implausible: heating on a guess is worse than not heating.
     */
    private function thermostat(?float $temp, float $target, bool $currentlyOn): bool
    {
        if (! $this->isPlausible($temp)) {
            return false;
        }

        return $currentlyOn
            ? $temp < ($target + self::TOLERANCE)
            : $temp <= ($target - self::TOLERANCE);
    }

    private function isPlausible(?float $temp): bool
    {
        return $temp !== null && $temp > self::PLAUSIBLE_MIN && $temp < self::PLAUSIBLE_MAX;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function commandsForRoom(Room $room, string $mode, bool $systemActive): array
    {
        $active = $systemActive && $room->isActive();

        // A room heated by its own unit runs it as a heat pump; a room on the
        // boiler leaves its unit idle all winter.
        $heatByAc = $active
            && $mode === 'heating'
            && $room->heat_source === 'ac'
            && $this->thermostat($room->current_temp, (float) $room->target_temp, $room->heating_on);

        $cool = $active && $mode === 'cooling';

        return $room->airConditioners
            ->map(fn (AirConditioner $ac) => $this->unitCommand(
                $ac,
                power: $ac->enabled && ($cool || $heatByAc),
                mode: $heatByAc ? 'heat' : 'cool',
                // The room owns the setpoint; every unit in it shares one target.
                target: (float) $room->target_temp,
            ))
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function unitCommand(AirConditioner $ac, bool $power, string $mode, float $target): array
    {
        if ($power && $this->isCoolingDown($ac)) {
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
            'target_temp' => (int) round($target),
        ];
    }

    private function isCoolingDown(AirConditioner $ac): bool
    {
        if ($ac->cooling_on || $ac->heating_on || ! $ac->power_changed_at) {
            return false;
        }

        return $ac->power_changed_at->diffInSeconds(now()) < self::AC_MIN_OFF_SECONDS;
    }

    private function persistUnitState(AirConditioner $ac, bool $power, string $mode, float $target): void
    {
        $wasOn = $ac->cooling_on || $ac->heating_on;

        $ac->cooling_on = $power && $mode === 'cool';
        $ac->heating_on = $power && $mode === 'heat';
        $ac->mode = $mode;
        $ac->target_temp = (int) round($target);

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

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
     * A wider deadband for compressors. The boiler may chase a tight band, but
     * a split must not power-cycle over half a degree of drift.
     */
    public const AC_TOLERANCE = 0.5;

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
                cooling: collect($roomUnits)->contains(fn ($u) => $u['power'] && $u['mode'] === 'cool'),
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
            'v' => 2,
            'boiler' => $boiler,
            'units' => $units,
            'expires_at' => time() + self::CONTROL_TTL_SECONDS,
        ];
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

    private function demandsCool(?float $temp, float $target, bool $currentlyOn, float $tolerance = self::TOLERANCE): bool
    {
        if (! $this->isPlausible($temp)) {
            return false;
        }

        return $currentlyOn
            ? $temp > ($target - $tolerance)
            : $temp >= ($target + $tolerance);
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
        // The house mode decides what a unit would do; nothing is set per unit.
        $unitMode = $mode === 'heating' ? 'heat' : 'cool';

        // A room heated by its own unit runs it as a heat pump; a room on the
        // boiler leaves its unit idle all winter.
        $hasAJob = $mode === 'cooling' || $room->heat_source === 'ac';

        $power = $hasAJob
            && $this->isRoomActive($room, $masterOn)
            && $this->roomDemands($room, $unitMode);

        return $room->airConditioners
            ->map(fn (AirConditioner $ac) => $this->unitCommand(
                $ac,
                power: $ac->enabled && $power,
                mode: $unitMode,
                // The room owns the setpoint; every unit in it shares one target.
                target: (float) $room->target_temp,
            ))
            ->all();
    }

    /**
     * Whether the room still wants its unit running.
     *
     * A room with its own sensor gets a real thermostat, so the unit stops once
     * the room is comfortable. A room that reads its temperature *off* the unit
     * cannot: a powered-off Gree stops reporting, so switching it off would
     * freeze the reading at the value that caused the switch-off, and nothing
     * would ever ask it to start again. Those rooms stay powered and leave the
     * regulating to the split's own inverter, which is what it is good at.
     */
    private function roomDemands(Room $room, string $unitMode): bool
    {
        if ($room->temp_source === 'ac') {
            return true;
        }

        $target = (float) $room->target_temp;

        return $unitMode === 'heat'
            ? $this->demandsHeat($room->current_temp, $target, $room->heating_on, self::AC_TOLERANCE)
            : $this->demandsCool($room->current_temp, $target, $room->cooling_on, self::AC_TOLERANCE);
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

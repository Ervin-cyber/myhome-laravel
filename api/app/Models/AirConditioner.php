<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AirConditioner extends Model
{
    protected $fillable = [
        'room_id',
        'name',
        'ip',
        'mac',
        'port',
        'target_temp',
        'enabled',
        'mode',
        'power_on',
        'fan_speed',
        'swing_vertical',
        'swing_horizontal',
        'xfan',
        'quiet',
        'turbo',
        'heating_on',
        'cooling_on',
        'online',
        'last_seen_at',
        'reported_temp',
        'reported_at',
        'calibration_offset',
        'power_changed_at',
        'observed_state',
        'observed_at',
        'settings_changed_at',
        'manual_power',
        'manual_since',
    ];

    /**
     * How long an observation of the unit's own state stays meaningful.
     *
     * The Pi only interrogates the units while a dashboard is open, so outside
     * that window the last answer ages out rather than being presented as
     * current. Matches SmartPlug::FRESH_SECONDS, the other signal that reports
     * hardware rather than intent.
     */
    public const OBSERVED_FRESH_SECONDS = 180;

    /**
     * How long a command gets to land before a unit still disagreeing is
     * called a fault rather than a request in flight.
     *
     * Long enough for the re-assert to have had a second go: it runs every
     * STATE_REASSERT_INTERVAL and a live poll drops the cached state the
     * moment it sees a disagreement, so a retry follows within about a minute.
     */
    public const SETTLE_SECONDS = 120;

    /**
     * Settings a person chooses, mapped to the key the unit reports them under.
     *
     * Power, mode and setpoint are absent on purpose. Those are decided by the
     * control loop from room temperature and the house mode, so they change
     * without anybody touching them and disagreeing about one is not a fault.
     */
    private const COMPARABLE = [
        'fan_speed' => 'fan_speed',
        'swing_vertical' => 'swing_v',
        'swing_horizontal' => 'swing_h',
        'xfan' => 'xfan',
        'quiet' => 'quiet',
        'turbo' => 'turbo',
    ];

    /** Values the dashboard may set, mirroring the greeclimate enums. */
    public const FAN_SPEEDS = ['auto', 'low', 'medium_low', 'medium', 'medium_high', 'high'];
    public const SWING_VERTICAL = ['off', 'full', 'fixed_upper', 'fixed_middle_up', 'fixed_middle', 'fixed_middle_low', 'fixed_lower'];
    public const SWING_HORIZONTAL = ['off', 'full', 'fixed_left', 'fixed_middle_left', 'fixed_middle', 'fixed_middle_right', 'fixed_right'];

    protected $casts = [
        'enabled' => 'boolean',
        'power_on' => 'boolean',
        'xfan' => 'boolean',
        'quiet' => 'boolean',
        'turbo' => 'boolean',
        'heating_on' => 'boolean',
        'cooling_on' => 'boolean',
        'online' => 'boolean',
        'last_seen_at' => 'datetime',
        'reported_temp' => 'float',
        'reported_at' => 'datetime',
        'calibration_offset' => 'float',
        'power_changed_at' => 'datetime',
        'observed_state' => 'array',
        'observed_at' => 'datetime',
        'settings_changed_at' => 'datetime',
        'manual_power' => 'boolean',
        'manual_since' => 'datetime',
    ];

    protected $appends = ['calibrated_temp', 'observed_power', 'divergence', 'divergence_settled', 'following_remote'];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /** Whether a person's own switching currently outranks the control loop. */
    public function getFollowingRemoteAttribute(): bool
    {
        return $this->manual_power !== null;
    }

    /**
     * Hand this unit back to automatic control.
     *
     * Called for any deliberate action in the app on this unit or its room:
     * using the dashboard is the same gesture as asking for control back, and
     * making it a separate step would leave people wondering why their press
     * did nothing.
     */
    public function resumeAutomatic(): void
    {
        if ($this->manual_power === null) {
            return;
        }

        $this->forceFill(['manual_power' => null, 'manual_since' => null])->save();
    }

    /**
     * The unit's own indoor reading, corrected by its calibration offset.
     * Gree units sit high on the wall in their own return airflow, so the
     * raw value typically reads warm.
     */
    public function getCalibratedTempAttribute(): ?float
    {
        if ($this->reported_temp === null) {
            return null;
        }

        return round($this->reported_temp + $this->calibration_offset, 1);
    }

    /**
     * The unit's own account of itself, or null when nobody has asked recently
     * enough for the answer to still mean anything.
     *
     * Null rather than an empty array on purpose. Everything else in this
     * system reports what we sent; conflating "we have not looked" with "it
     * reports nothing" would turn the one honest signal we have back into
     * another echo of our own intent.
     */
    public function freshObservation(): ?array
    {
        if (! is_array($this->observed_state) || $this->observed_at === null) {
            return null;
        }

        return $this->observed_at->diffInSeconds(now()) <= self::OBSERVED_FRESH_SECONDS
            ? $this->observed_state
            : null;
    }

    public function getObservedPowerAttribute(): ?bool
    {
        $observed = $this->freshObservation();

        return isset($observed['power']) ? (bool) $observed['power'] : null;
    }

    /**
     * Settings where the unit disagrees with us, and what it has instead.
     *
     * Empty is the normal case and also what a stale observation returns: with
     * nothing recent to compare against, silence is the only honest answer.
     *
     * @return array<string, mixed>
     */
    public function getDivergenceAttribute(): array
    {
        $observed = $this->freshObservation();

        if ($observed === null) {
            return [];
        }

        // Settings are only ever written to a running unit -- send_gree_command
        // sets power and stops there when switching off -- so a unit that is
        // off still holds whatever it was last left with. Comparing against
        // that would mark every switched-off unit as having failed to take a
        // command nobody sent it.
        if (! $this->power_on || ! ($observed['power'] ?? false)) {
            return [];
        }

        $diverged = [];

        foreach (self::COMPARABLE as $ours => $theirs) {
            // A unit under quiet or turbo picks its own fan speed and reports
            // that, so comparing it would report a fault against every unit
            // doing exactly what it was asked.
            if ($ours === 'fan_speed' && ($this->quiet || $this->turbo)) {
                continue;
            }

            if (! array_key_exists($theirs, $observed) || $observed[$theirs] === null) {
                continue;
            }

            $mine = $this->{$ours};
            $its = is_bool($mine) ? (bool) $observed[$theirs] : $observed[$theirs];

            if ($mine !== $its) {
                $diverged[$ours] = $its;
            }
        }

        return $diverged;
    }

    /**
     * Whether a disagreement has lasted long enough to be a fault rather than
     * a command still in flight.
     *
     * With no recorded change, anything we see is the unit's own doing — a
     * handset, or a setting it declined — and there is nothing in flight for
     * it to be.
     */
    public function getDivergenceSettledAttribute(): bool
    {
        if ($this->settings_changed_at === null) {
            return true;
        }

        return $this->settings_changed_at->diffInSeconds(now()) > self::SETTLE_SECONDS;
    }
}

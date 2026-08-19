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
        'commanded_at',
        'rejected_settings',
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
     * How long a command has to land before we believe the unit over ourselves.
     *
     * Until it elapses the unit is still reporting what it held a moment ago,
     * and adopting that would undo the press that was just made. After it, the
     * unit has had its say and is simply right.
     */
    public const SETTLE_SECONDS = 90;

    /**
     * Settings a person chooses, mapped to the key the unit reports them under.
     *
     * These are adopted from the unit: whatever it says it is doing becomes
     * what this row says, whether the change came from here, the handset or the
     * Gree app. Power, mode and setpoint are absent because they are not
     * per-unit preferences -- power is the control loop's, mode is the house's,
     * and the setpoint belongs to the room.
     */
    public const ADOPTED = [
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
        'commanded_at' => 'datetime',
        'rejected_settings' => 'array',
        'manual_power' => 'boolean',
        'manual_since' => 'datetime',
    ];

    protected $appends = ['calibrated_temp', 'observed_power', 'following_remote', 'awaiting', 'rejected'];

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
     * Whether a command is still on its way to this unit.
     *
     * Purely a matter of time. Nothing confirms a command -- the unit is asked
     * what it is doing on its own schedule -- so this is the window in which we
     * decline to believe an observation over a press that has just been made.
     */
    public function getAwaitingAttribute(): bool
    {
        return $this->commanded_at !== null
            && $this->commanded_at->diffInSeconds(now()) < self::SETTLE_SECONDS;
    }

    /**
     * Settings whose last command the unit did not take.
     *
     * Nothing retries, so a rejected change reverts to what the unit actually
     * has. That is correct and completely silent, and without this it is
     * indistinguishable from never having pressed the button at all.
     *
     * @return array<int, string>
     */
    public function getRejectedAttribute(): array
    {
        return array_values(array_filter(
            (array) ($this->rejected_settings ?? []),
            fn ($field) => array_key_exists($field, self::ADOPTED)
        ));
    }

    /**
     * Take on what the unit says about itself.
     *
     * The unit is the authority on every setting in ADOPTED, whoever changed
     * it. A value we asked for and did not get is recorded as rejected on the
     * way past -- that is the only trace left of a command, since nothing
     * retries one.
     *
     * Does nothing while a command may still be travelling, when the unit is
     * still truthfully reporting what it held a second ago.
     */
    public function adoptObservedSettings(): void
    {
        $observed = $this->freshObservation();

        if ($observed === null || $this->awaiting) {
            return;
        }

        $rejected = $this->rejected;

        foreach (self::ADOPTED as $ours => $theirs) {
            if (! array_key_exists($theirs, $observed) || $observed[$theirs] === null) {
                continue;
            }

            $its = is_bool($this->{$ours}) ? (bool) $observed[$theirs] : $observed[$theirs];

            if ($this->{$ours} === $its) {
                // It holds what we last asked for, so nothing outstanding.
                $rejected = array_values(array_diff($rejected, [$ours]));

                continue;
            }

            // Only a command can have been refused. Without one this is simply
            // somebody at the handset, which is not a failure of anything.
            if ($this->commanded_at !== null && ! in_array($ours, $rejected, true)) {
                $rejected[] = $ours;
            }

            $this->{$ours} = $its;
        }

        $this->rejected_settings = $rejected ?: null;
    }
}

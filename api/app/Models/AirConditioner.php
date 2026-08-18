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
        'observed_power_on',
        'observed_at',
    ];

    /**
     * How long an observation of the unit's own power state stays meaningful.
     *
     * The Pi only interrogates the units while a dashboard is open, so outside
     * that window the last answer ages out rather than being presented as
     * current. Matches SmartPlug::FRESH_SECONDS, the other signal that reports
     * hardware rather than intent.
     */
    public const OBSERVED_FRESH_SECONDS = 180;

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
        'observed_power_on' => 'boolean',
        'observed_at' => 'datetime',
    ];

    protected $appends = ['calibrated_temp', 'observed_power'];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
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
     * What the unit itself last said about its power, or null when nobody has
     * asked recently enough for the answer to still mean anything.
     *
     * Null rather than false on purpose. Everything else in this system reports
     * what we sent; conflating "we have not looked" with "it is off" would turn
     * the one honest signal we have back into another echo of our own intent.
     */
    public function getObservedPowerAttribute(): ?bool
    {
        if ($this->observed_power_on === null || $this->observed_at === null) {
            return null;
        }

        return $this->observed_at->diffInSeconds(now()) <= self::OBSERVED_FRESH_SECONDS
            ? (bool) $this->observed_power_on
            : null;
    }
}

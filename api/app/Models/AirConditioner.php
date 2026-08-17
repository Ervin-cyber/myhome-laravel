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
        'heating_on',
        'cooling_on',
        'online',
        'last_seen_at',
        'reported_temp',
        'reported_at',
        'calibration_offset',
        'power_changed_at',
    ];

    /** Values the dashboard may set, mirroring the greeclimate enums. */
    public const FAN_SPEEDS = ['auto', 'low', 'medium_low', 'medium', 'medium_high', 'high'];
    public const SWING_VERTICAL = ['off', 'full', 'fixed_upper', 'fixed_middle_up', 'fixed_middle', 'fixed_middle_low', 'fixed_lower'];
    public const SWING_HORIZONTAL = ['off', 'full', 'fixed_left', 'fixed_middle_left', 'fixed_middle', 'fixed_middle_right', 'fixed_right'];

    protected $casts = [
        'enabled' => 'boolean',
        'power_on' => 'boolean',
        'xfan' => 'boolean',
        'heating_on' => 'boolean',
        'cooling_on' => 'boolean',
        'online' => 'boolean',
        'last_seen_at' => 'datetime',
        'reported_temp' => 'float',
        'reported_at' => 'datetime',
        'calibration_offset' => 'float',
        'power_changed_at' => 'datetime',
    ];

    protected $appends = ['calibrated_temp'];

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
}

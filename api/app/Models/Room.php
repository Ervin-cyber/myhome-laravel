<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Room extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'icon',
        'sort_order',
        'target_temp',
        'enabled',
        'hvac_until',
        'temp_source',
        'sensor_device',
        'calibration_offset',
        'heat_source',
        'drives_boiler',
        'current_temp',
        'current_temp_at',
        'heating_on',
        'cooling_on',
    ];

    protected $casts = [
        'target_temp' => 'float',
        'enabled' => 'boolean',
        'hvac_until' => 'integer',
        'calibration_offset' => 'float',
        'drives_boiler' => 'boolean',
        'current_temp' => 'float',
        'current_temp_at' => 'datetime',
        'heating_on' => 'boolean',
        'cooling_on' => 'boolean',
    ];

    protected $appends = ['is_boosting'];

    public function airConditioners(): HasMany
    {
        return $this->hasMany(AirConditioner::class);
    }

    public function temperatureReadings(): HasMany
    {
        return $this->hasMany(TemperatureReading::class);
    }

    public function getIsBoostingAttribute(): bool
    {
        return $this->hvac_until > time();
    }

    /**
     * A room acts on demand when it is switched on, or while boosting.
     */
    public function isActive(): bool
    {
        return $this->enabled || $this->is_boosting;
    }

    /**
     * Read this room's temperature from its configured source.
     *
     * Returns null when the source has nothing to offer — an unassigned AC,
     * or a sensor that has never reported. Callers must handle that rather
     * than substituting a default, or the controller would act on a guess.
     */
    public function readCurrentTemp(): ?float
    {
        $raw = match ($this->temp_source) {
            'sensor' => $this->readSensorTemp(),
            'ac' => $this->readAcTemp(),
            default => null,
        };

        if ($raw === null) {
            return null;
        }

        return round($raw + $this->calibration_offset, 2);
    }

    private function readSensorTemp(): ?float
    {
        if (! $this->sensor_device) {
            return null;
        }

        return TemperatureReading::where('device', $this->sensor_device)
            ->orderByDesc('timestamp')
            ->value('value');
    }

    /**
     * Gree units only report while powered, so prefer the unit with the
     * freshest reading rather than the first one assigned to the room.
     */
    private function readAcTemp(): ?float
    {
        $ac = $this->airConditioners()
            ->whereNotNull('reported_temp')
            ->orderByDesc('reported_at')
            ->first();

        return $ac?->calibrated_temp;
    }

    /**
     * Recompute and persist the denormalised reading used by the dashboard
     * and the control loop.
     */
    public function refreshCurrentTemp(): void
    {
        $temp = $this->readCurrentTemp();

        if ($temp === null) {
            return;
        }

        $this->forceFill([
            'current_temp' => $temp,
            'current_temp_at' => now(),
        ])->save();
    }
}

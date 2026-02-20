<?php

namespace App\Models;

use App\Observers\OwnerObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasEvents;
use Illuminate\Database\Eloquent\Model;
use DateTimeInterface;

#[ObservedBy(OwnerObserver::class)]
class TemperatureReading extends Model
{
    use HasEvents;

    protected $keyType = 'integer';

    protected $fillable = ['value', 'device', 'rssi'];

    public $timestamps = false;

    protected $casts = [
        'timestamp' => 'datetime', 
    ];

    protected function serializeDate(DateTimeInterface $date): string
    {
        return $date->format('c'); // 'c' outputs ISO 8601 (e.g., 2025-12-12T14:20:24+00:00)
    }

    protected static function booted()
    {
        static::saving(function ($model) {
            $model->timestamp = now();
        });
    }

    public static function getLatestTemperature() 
    {
        return TemperatureReading::orderBy('timestamp', 'desc')->first();
    }
}

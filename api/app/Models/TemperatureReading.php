<?php

namespace App\Models;

use App\Observers\OwnerObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasEvents;
use Illuminate\Database\Eloquent\Model;

#[ObservedBy(OwnerObserver::class)]
class TemperatureReading extends Model
{
    use HasEvents;

    protected $keyType = 'integer';

    protected $fillable = ['value', 'created_by', 'updated_by'];

    public $timestamps = false;

    protected static function booted()
    {
        static::saving(function ($model) {
            $model->timestamp = now();
        });
    }

    public static function getLatestTemperature() 
    {
        return TemperatureReading::orderBy('created_at', 'desc')->first();
    }
}

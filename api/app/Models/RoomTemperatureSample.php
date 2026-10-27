<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A history point for a room that reads its temperature off its unit.
 *
 * Not a TemperatureReading on purpose. Creating one of those broadcasts to
 * every listener and moves the dashboard's "updated" clock, both of which mean
 * "an ESP reported", and a unit's reading taken during a sync is neither.
 */
class RoomTemperatureSample extends Model
{
    public $timestamps = false;

    protected $fillable = ['room_id', 'value', 'sampled_at'];

    protected $casts = [
        'value' => 'float',
        'sampled_at' => 'datetime',
    ];
}

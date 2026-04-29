<?php

namespace App\Models;

use App\Observers\OwnerObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasEvents;
use Illuminate\Database\Eloquent\Model;

#[ObservedBy(OwnerObserver::class)]
class SystemState extends Model
{
    use HasEvents;

    protected $keyType = 'integer';

    protected $fillable = ['target_temp', 'hvac_until', 'heating_on', 'mode', 'cooling_on'];

    public $timestamps = false;

    protected $casts = [
        'heating_on' => 'boolean',
        'cooling_on' => 'boolean',
    ];

    protected static function booted()
    {
        static::saving(function ($model) {
            $model->timestamp = now();
            
            // Mutual exclusion logic
            if ($model->mode === 'cooling') {
                $model->heating_on = false;
            } elseif ($model->mode === 'heating') {
                $model->cooling_on = false;
            }
        });
    }
}

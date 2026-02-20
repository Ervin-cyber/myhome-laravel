<?php

namespace App\Models;

use App\Observers\OwnerObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasEvents;
use Illuminate\Database\Eloquent\Model;

#[ObservedBy(OwnerObserver::class)]
class HeatingLog extends Model
{
    use HasEvents;

    protected $keyType = 'integer';

    protected $fillable = ['from_state', 'to_state', 'run_time'];

    public $timestamps = false;

    protected static function booted()
    {
        static::saving(function ($model) {
            $model->timestamp = now();
        });
    }
}

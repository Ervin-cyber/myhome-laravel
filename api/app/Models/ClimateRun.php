<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class ClimateRun extends Model
{
    public const SOURCE_BOILER = 'boiler';
    public const SOURCE_AC = 'ac';

    public $timestamps = false;

    protected $fillable = [
        'source', 'air_conditioner_id', 'room_id', 'mode',
        'started_at', 'confirmed_at', 'ended_at',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function airConditioner(): BelongsTo
    {
        return $this->belongsTo(AirConditioner::class);
    }

    /** Where the run stops counting: its end, or the last time it was seen. */
    public function effectiveEnd(): Carbon
    {
        return $this->ended_at ?? $this->confirmed_at;
    }

    /** Seconds of this run that fall inside [$from, $to]. */
    public function secondsWithin(Carbon $from, Carbon $to): int
    {
        $start = $this->started_at->max($from);
        $end = $this->effectiveEnd()->min($to);

        return max(0, (int) $start->diffInSeconds($end, false));
    }
}

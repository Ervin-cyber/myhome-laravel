<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SmartPlug extends Model
{
    /**
     * Draw below this is standby: the unit is off and only its own
     * electronics are awake. A Gree idles at a couple of watts.
     */
    public const STANDBY_WATTS = 10.0;

    /**
     * Below this something is running the fan but not the compressor. Useful
     * for telling "took the power command but not the mode" apart from
     * "actually cooling".
     */
    public const FAN_ONLY_WATTS = 150.0;

    /** A reading older than this tells us nothing about what is happening now. */
    public const FRESH_SECONDS = 180;

    protected $fillable = [
        'mac',
        'name',
        'ip',
        'room_id',
        'online',
        'last_seen_at',
        'watts',
        'watts_at',
        'energy_today',
    ];

    protected $casts = [
        'online' => 'boolean',
        'last_seen_at' => 'datetime',
        'watts' => 'float',
        'watts_at' => 'datetime',
        'energy_today' => 'float',
    ];

    protected $appends = ['activity'];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }

    /**
     * Whether the reading is recent enough to say anything about now.
     *
     * The Pi only polls plugs periodically, so an old value is not evidence
     * that nothing is running — it is the absence of evidence either way.
     */
    public function hasFreshReading(): bool
    {
        return $this->watts !== null
            && $this->watts_at !== null
            && $this->watts_at->diffInSeconds(now()) <= self::FRESH_SECONDS;
    }

    /**
     * What the draw says is happening downstream of this plug.
     *
     * This is the only feedback the system has that a command actually landed:
     * everything else in the loop reports what we *sent*.
     */
    public function getActivityAttribute(): string
    {
        if (! $this->hasFreshReading()) {
            return 'unknown';
        }

        if ($this->watts < self::STANDBY_WATTS) {
            return 'idle';
        }

        return $this->watts < self::FAN_ONLY_WATTS ? 'fan' : 'compressor';
    }
}

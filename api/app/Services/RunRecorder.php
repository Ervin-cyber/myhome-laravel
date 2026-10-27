<?php

namespace App\Services;

use App\Models\AirConditioner;
use App\Models\ClimateRun;
use App\Models\Room;
use App\Models\RoomTemperatureSample;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Turns "is it running right now" observations into runs.
 *
 * Fed by what the hardware reports, never by what it was told: a unit's own
 * power reading from a sync, and the boiler relay state the Pi reports back.
 * Counting commands would credit a unit that never heard one.
 */
class RunRecorder
{
    public function observeUnit(AirConditioner $ac, bool $running, ?string $mode): void
    {
        $this->observe(ClimateRun::SOURCE_AC, $ac->id, $ac->room_id, $running, $mode);
    }

    public function observeBoiler(bool $running): void
    {
        $this->observe(ClimateRun::SOURCE_BOILER, null, null, $running, 'heat');
    }

    /**
     * Record one observation.
     *
     * Running and an open run seen recently: the run carries on. Running with
     * none, or with one last seen too long ago: a new run, and the stale one
     * ends where it was last seen. Not running: the open run ends now -- or,
     * if nobody had seen it for a while, at the last moment somebody had.
     */
    private function observe(string $source, ?int $acId, ?int $roomId, bool $running, ?string $mode): void
    {
        DB::transaction(function () use ($source, $acId, $roomId, $running, $mode) {
            $now = now();
            $gap = config('climate.run_gap_seconds');

            $open = ClimateRun::where('source', $source)
                ->where('air_conditioner_id', $acId)
                ->whereNull('ended_at')
                ->lockForUpdate()
                ->latest('id')
                ->first();

            $fresh = $open && $open->confirmed_at->diffInSeconds($now) <= $gap;

            if ($running && $fresh) {
                $open->update(['confirmed_at' => $now]);

                return;
            }

            if ($open) {
                $open->update(['ended_at' => $fresh ? $now : $open->confirmed_at]);
            }

            if ($running) {
                ClimateRun::create([
                    'source' => $source,
                    'air_conditioner_id' => $acId,
                    'room_id' => $roomId,
                    'mode' => $mode,
                    'started_at' => $now,
                    'confirmed_at' => $now,
                ]);
            }
        });
    }

    /**
     * A history point for a room that reads its temperature off its unit, at
     * most once per room_sample_seconds however often the units are read.
     */
    public function sampleRoom(Room $room): void
    {
        $interval = config('climate.room_sample_seconds');

        // refreshCurrentTemp keeps the old value when the unit has nothing new
        // -- a Gree stops reporting once it is switched off -- so a sample is
        // only taken from a reading young enough to belong to this interval.
        // Copying a stale one forward would flatten the min and max into it.
        if ($room->current_temp === null
            || $room->current_temp_at === null
            || $room->current_temp_at->diffInSeconds(now(), true) >= $interval) {
            return;
        }

        $last = RoomTemperatureSample::where('room_id', $room->id)->max('sampled_at');

        if ($last && Carbon::parse($last)->diffInSeconds(now(), true) < $interval) {
            return;
        }

        RoomTemperatureSample::create([
            'room_id' => $room->id,
            'value' => $room->current_temp,
            'sampled_at' => now(),
        ]);
    }
}

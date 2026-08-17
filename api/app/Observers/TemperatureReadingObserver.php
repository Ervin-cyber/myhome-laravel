<?php

namespace App\Observers;

use App\Events\LiveReadingCreated;
use App\Models\TemperatureReading;

class TemperatureReadingObserver
{
    public function created(TemperatureReading $temperatureReading): void
    {
        // Refresh the room before broadcasting, so the payload carries the
        // reading that just arrived rather than the previous one.
        $temperatureReading->room?->refreshCurrentTemp();

        event(new LiveReadingCreated($temperatureReading));
    }
}

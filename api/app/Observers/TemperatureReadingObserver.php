<?php

namespace App\Observers;

use App\Events\LiveReadingCreated;
use App\Models\TemperatureReading;

class TemperatureReadingObserver
{
    public function created(TemperatureReading $temperatureReading): void
    {
        event(new LiveReadingCreated($temperatureReading));
    }
}

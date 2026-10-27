<?php

namespace App\Observers;

use App\Events\LiveReadingCreated;
use App\Models\SystemState;
use App\Services\RunRecorder;

class SystemStateObserver
{
    public function __construct(private RunRecorder $runs)
    {
    }

    public function created(SystemState $systemState): void
    {
        event(new LiveReadingCreated($systemState));
    }

    public function updated(SystemState $systemState): void
    {
        // heating_on is the relay as the Pi last reported it, so its edges are
        // the boiler's runs. Recorded on the change itself; the Pi's minute
        // poll keeps an open run confirmed in between.
        if ($systemState->wasChanged('heating_on')) {
            $this->runs->observeBoiler((bool) $systemState->heating_on);
        }

        event(new LiveReadingCreated($systemState));
    }
}

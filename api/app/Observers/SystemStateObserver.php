<?php

namespace App\Observers;

use App\Events\LiveReadingCreated;
use App\Models\SystemState;

class SystemStateObserver
{
    public function created(SystemState $systemState): void
    {
        event(new LiveReadingCreated($systemState));
    }
    public function updated(SystemState $systemState): void
    {
        event(new LiveReadingCreated($systemState));
    }
}

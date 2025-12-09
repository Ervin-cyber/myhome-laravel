<?php

namespace App\Providers;

use App\Models\SystemState;
use App\Models\TemperatureReading;
use App\Observers\TemperatureReadingObserver;
use App\Observers\SystemStateObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        TemperatureReading::observe(TemperatureReadingObserver::class);
        SystemState::observe(SystemStateObserver::class);
    }
}

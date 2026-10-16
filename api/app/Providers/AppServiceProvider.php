<?php

namespace App\Providers;

use App\Models\SystemState;
use App\Models\TemperatureReading;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
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

        // The house's season and who may use the app. Everything else on the
        // dashboard is open to any signed-in member of the household.
        Gate::define('admin', fn (User $user) => $user->isAdmin());
    }
}

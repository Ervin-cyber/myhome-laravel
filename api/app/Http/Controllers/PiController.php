<?php

namespace App\Http\Controllers;

use App\Models\SystemState;
use App\Models\TemperatureReading;
use App\Services\ClimateService;
use Illuminate\Http\Request;

class PiController extends Controller
{
    public function __construct(private ClimateService $climate)
    {
    }

    /**
     * The Pi's fallback poll. It normally acts on the broadcast; this is what
     * it falls back to after a websocket drop, so it must carry the same
     * control document rather than raw state for the Pi to interpret.
     */
    public function getParamsForPi()
    {
        $latestTemp = TemperatureReading::getLatestTemperature();
        $systemState = SystemState::first();

        return [
            'control' => $this->climate->evaluate(),

            // Retained for observability; the Pi acts on `control` alone.
            'temperature' => $latestTemp?->value,
            'last_updated' => $latestTemp?->timestamp,
            'enabled' => boolval($systemState?->enabled),
            'mode' => $systemState?->mode ?? 'heating',
            'heating_on' => boolval($systemState?->heating_on),
            'cooling_on' => boolval($systemState?->cooling_on),
            'set_temp' => $systemState?->target_temp,
            'hvac_until' => $systemState?->hvac_until,
        ];
    }
}

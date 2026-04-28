<?php

namespace App\Http\Controllers;

use App\Models\SystemState;
use App\Models\TemperatureReading;
use Illuminate\Http\Request;

class PiController extends Controller
{
    public function getParamsForPi()
    {
        $latestTemp = TemperatureReading::getLatestTemperature();

        $systemState = SystemState::first();

        return [
            'temperature' => $latestTemp->value,
            'last_updated' => $latestTemp->timestamp,
            'mode' => $systemState->mode ?? 'heating',
            'heating_on' => boolval($systemState->heating_on),
            'cooling_on' => boolval($systemState->cooling_on),
            'set_temp' => $systemState->target_temp,
            'heating_until' => $systemState->heating_until,
        ];
    }
}

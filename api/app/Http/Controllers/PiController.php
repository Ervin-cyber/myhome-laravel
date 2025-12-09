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
            'heating_on' => $systemState->heating_on,
            'set_temp' => $latestTemp->target_temp,
            'heating_until' => $latestTemp->heating_until,
        ];
    }
}

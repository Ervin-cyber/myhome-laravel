<?php

namespace App\Http\Controllers;

use App\Models\TemperatureReading;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class TemperatureController extends Controller
{
    public function index()
    {
        return TemperatureReading::orderBy('created_at', 'desc')->limit(50)->get();
    }

    public function getLatestTemperature()
    {
        return response()->json(TemperatureReading::getLatestTemperature(), 200);
    }

    public function store(Request $request)
    {
        $temperature = Arr::get($request, 'value', -1);

        if (empty($temperature) || $temperature > 40 || $temperature < 0) {
            return response()->json(['message' => "Wrong temperature"], 500);
        }

        TemperatureReading::create(['value' => $temperature]);

        return response()->json(['message' => "Success"], 200);
    }
}

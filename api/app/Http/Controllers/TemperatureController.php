<?php

namespace App\Http\Controllers;

use App\Models\TemperatureReading;
use Illuminate\Http\Request;
use App\Http\Requests\TemperatureRequest;
use Illuminate\Support\Arr;

class TemperatureController extends Controller
{
    public function index()
    {
        return TemperatureReading::orderBy('timestamp', 'desc')->limit(50)->get();
    }

    public function getLatestTemperature()
    {
        return response()->json(TemperatureReading::getLatestTemperature(), 200);
    }

    public function store(TemperatureRequest $request)
    {
        TemperatureReading::create($request->validated());

        return response()->json(['message' => "Success"], 200);
    }
}

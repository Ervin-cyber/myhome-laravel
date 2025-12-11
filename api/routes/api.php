<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\PiController;
use App\Http\Controllers\StatsController;
use App\Http\Controllers\SystemStateController;
use App\Http\Controllers\TemperatureController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware(['auth:sanctum'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/temperature-latest', [TemperatureController::class, 'getLatestTemperature']);
    Route::post('/temperature', [TemperatureController::class, 'store']);

    Route::get('/state', [SystemStateController::class, 'show']);
    Route::post('/state', [SystemStateController::class, 'update']);

    Route::get('/stats', [StatsController::class, 'index']);

    Route::get('/params', [PiController::class, 'getParamsForPi']);
});

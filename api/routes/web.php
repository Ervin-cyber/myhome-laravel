<?php

use App\Http\Controllers\TemperatureController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['status' => 'OK']);
})->name('home');

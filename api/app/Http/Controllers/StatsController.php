<?php

namespace App\Http\Controllers;

use App\Models\HeatingLog;
use App\Models\TemperatureReading;
use Illuminate\Http\Request;

class StatsController extends Controller
{

    //CREATE INDEX heating_logs_logged_at_index ON heating_logs (logged_at);
    public function index()
    {
        $temp_stats = TemperatureReading::selectRaw('
            MIN(value) as temp_min,
            MAX(value) as temp_max,
            AVG(value) as temp_avg
        ')
        ->where('timestamp', '>=', now()->subHours(24))
        ->first();

        $run_time = HeatingLog::where('timestamp', '>=', now()->subHours(24))
            ->sum('run_time');

        $count_on = HeatingLog::where('timestamp', '>=', now()->subHours(24))
            ->where(['from_state' => 0, 'to_state' => 1])
            ->count('run_time');

        return [
            'temp_max' => $temp_stats->temp_max,
            'temp_avg' => $temp_stats->temp_avg,
            'temp_min' => $temp_stats->temp_min,
            'run_time' => $run_time,
            'count_on' => $count_on,
        ];
    }
}

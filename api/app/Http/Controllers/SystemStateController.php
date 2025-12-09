<?php

namespace App\Http\Controllers;

use App\Http\Requests\SystemStateRequest;
use App\Models\HeatingLog;
use App\Models\SystemState;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class SystemStateController extends Controller
{
    public function show()
    {
        return response()->json(SystemState::first(), 200);
    }

    public function update(SystemStateRequest $request)
    {
        $heatingUntil = Arr::get($request, 'heating_until', null);
        $heatingOn = Arr::get($request, 'heating_on', null);

        if ($heatingUntil === 15 || $heatingUntil === 30) {
            $heatingUntil = time() + (60 * $heatingUntil);
        } elseif ($heatingUntil > (time() + 3610)) {
            $heatingUntil = 0;
        }

        $state = SystemState::firstOrCreate();

        if ($heatingOn !== null && $state->heating_on != $heatingOn) {
            $lastLog = HeatingLog::orderByDesc('timestamp')->first();

            HeatingLog::create([
                'from_state' => $state->heating_on,
                'to_state'   => $heatingOn,
                'run_time'   => $state->heating_on
                    ? time() - strtotime(optional($lastLog)->timestamp)
                    : 0,
                'timestamp'  => time(),
            ]);
        }

        $state->update($request->validated());

        return response()->json(['message' => "Success"], 200);
    }
}

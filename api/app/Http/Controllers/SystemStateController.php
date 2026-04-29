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
        $data = $request->validated();
        $hvacUntil = $data['hvac_until'] ?? $data['heating_until'] ?? null;
        $heatingOn = $data['heating_on'] ?? null;

        if ($hvacUntil === 15 || $hvacUntil === 30) {
            $data['hvac_until'] = time() + (60 * $hvacUntil);
        } elseif ($hvacUntil > (time() + 3610)) {
            $data['hvac_until'] = 0;
        }

        $state = SystemState::firstOrCreate();
        $oldState = $state->replicate();

        // Mode switching logic
        if (isset($data['mode'])) {
            $state->mode = $data['mode'];
            
            // If switching to cooling, disable heating
            if ($data['mode'] === 'cooling') {
                $state->heating_on = false;
                if (isset($data['cooling_on'])) {
                    $state->cooling_on = $data['cooling_on'];
                }
            }
            // If switching to heating, disable cooling
            elseif ($data['mode'] === 'heating') {
                $state->cooling_on = false;
                if (isset($data['heating_on'])) {
                    $state->heating_on = $data['heating_on'];
                }
            }
        }

        // Temperature setting
        if (isset($data['target_temp'])) {
            $state->target_temp = $data['target_temp'];
        }

        if (isset($data['hvac_until'])) {
            $state->hvac_until = $data['hvac_until'];
        }

        // Heating on/off (only if in heating mode)
        if (isset($data['heating_on']) && $state->mode === 'heating') {
            $state->heating_on = $data['heating_on'];
        }

        // Cooling on/off (only if in cooling mode)
        if (isset($data['cooling_on']) && $state->mode === 'cooling') {
            $state->cooling_on = $data['cooling_on'];
        }

        // Log state changes
        if ($oldState->heating_on != $state->heating_on || 
            $oldState->cooling_on != $state->cooling_on) {
            
            $fromState = $oldState->heating_on ? 'heating_on' : 
                        ($oldState->cooling_on ? 'cooling_on' : 'off');
            $toState = $state->heating_on ? 'heating_on' : 
                      ($state->cooling_on ? 'cooling_on' : 'off');
            
            HeatingLog::create([
                'from_state' => $fromState,
                'to_state' => $toState,
                'run_time' => $state->hvac_until ?? 0,
            ]);
        }

        $state->save();

        return response()->json(['message' => "Success"], 200);
    }
}

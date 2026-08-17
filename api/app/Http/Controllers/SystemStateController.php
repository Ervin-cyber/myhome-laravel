<?php

namespace App\Http\Controllers;

use App\Http\Requests\SystemStateRequest;
use App\Models\AirConditioner;
use App\Models\HeatingLog;
use App\Models\Room;
use App\Models\SystemState;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class SystemStateController extends Controller
{
    public function show()
    {
        $state = SystemState::first();

        // Rooms and units ship with the initial load, otherwise the dashboard
        // renders empty until the first broadcast happens to arrive.
        return response()->json([
            ...($state?->toArray() ?? []),
            'rooms' => Room::with('airConditioners')->orderBy('sort_order')->get(),
            'air_conditioners' => AirConditioner::orderBy('id')->get(),
        ], 200);
    }

    public function update(SystemStateRequest $request)
    {
        $data = $request->validated();
        $hvacUntil = $data['hvac_until'] ?? $data['heating_until'] ?? null;
        
        if (in_array($hvacUntil, [15, 30, 60])) {
            $data['hvac_until'] = time() + (60 * $hvacUntil);
        } elseif ($hvacUntil > (time() + 7210)) {
            $data['hvac_until'] = 0;
        }

        $state = SystemState::firstOrCreate();
        $oldState = $state->replicate();

        if (isset($data['enabled'])) {
            $state->enabled = $data['enabled'];
        }

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

        // If disabled and no boost, force everything off
        if (!$state->enabled && ($state->hvac_until === 0 || $state->hvac_until < time())) {
            $state->heating_on = false;
            $state->cooling_on = false;
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

        $this->mirrorToBoilerRoom($data, $state);

        return response()->json(['message' => "Success"], 200);
    }

    /**
     * Transitional: the dashboard's main thermostat still writes the house-level
     * setpoint here, while rooms are the authoritative owner of target and boost.
     * Mirror it onto the room driving the boiler so the two cannot diverge.
     * Remove once the dashboard writes per-room targets directly.
     */
    private function mirrorToBoilerRoom(array $data, SystemState $state): void
    {
        $room = Room::where('drives_boiler', true)->first();

        if (! $room) {
            return;
        }

        if (isset($data['target_temp'])) {
            $room->target_temp = $data['target_temp'];
        }

        if (array_key_exists('hvac_until', $data)) {
            $room->hvac_until = $state->hvac_until ?? 0;
        }

        if ($room->isDirty()) {
            $room->save();
        }
    }
}

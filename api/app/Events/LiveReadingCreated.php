<?php

namespace App\Events;

use App\Models\SystemState;
use App\Models\TemperatureReading;
use App\Models\AirConditioner;
use App\Models\Room;
use App\Models\SmartPlug;
use App\Services\ClimateService;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class LiveReadingCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $reading;

    public function __construct($reading)
    {
        $latestTemp = TemperatureReading::getLatestTemperature();
        $systemState = SystemState::first();

        // Evaluate before reading rooms back, so the payload carries the state
        // the controller just decided rather than the previous one.
        $control = app(ClimateService::class)->evaluate();

        $this->reading = [
            'control' => $control,
            'temperature' => $latestTemp?->value,
            'last_updated' => $latestTemp?->timestamp,
            'enabled' => boolval($systemState?->enabled),
            'heating_on' => boolval($systemState?->heating_on),
            'cooling_on' => boolval($systemState?->cooling_on),
            'mode' => $systemState?->mode,
            'set_temp' => $systemState?->target_temp,
            'hvac_until' => $systemState?->hvac_until,
            'rooms' => Room::with('airConditioners')->orderBy('sort_order')->get(),
            'smart_plugs' => SmartPlug::climate(),
            // Explicit column list: last_seen_at and the model timestamps change on
            // every discovery scan and would otherwise churn this payload, which the
            // Pi diffs to decide whether to re-issue commands.
            'air_conditioners' => AirConditioner::orderBy('id')->get([
                'id',
                'room_id',
                'name',
                'ip',
                'mac',
                'port',
                'target_temp',
                'enabled',
                'mode',
                'power_on',
                'fan_speed',
                'swing_vertical',
                'swing_horizontal',
                'xfan',
                'quiet',
                'turbo',
                'heating_on',
                'cooling_on',
                'online',
                'reported_temp',
                'reported_at',
                'calibration_offset',
                // All three, or the observed accessors silently read null off
                // unloaded columns and every unit looks like it agrees with us.
                'observed_state',
                'observed_at',
                'commanded_at',
                'rejected_settings',
                'manual_power',
                'manual_since',
            ]),
        ];
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('live-updates'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'reading.created';
    }
}

<?php

namespace App\Events;

use App\Models\SystemState;
use App\Models\TemperatureReading;
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
        
        $this->reading = [
            'temperature' => $latestTemp->value,
            'last_updated' => $latestTemp->timestamp,
            'heating_on' => boolval($systemState->heating_on),
            'set_temp' => $systemState->target_temp,
            'heating_until' => $systemState->heating_until,
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

<?php

namespace App\Events;

use App\Models\SystemState;
use App\Models\TemperatureReading;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class LiveReadingCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $temperatureReading;
    public $systemStateReading;

    public function __construct($reading)
    {
        if ($reading instanceof TemperatureReading) {
            $this->temperatureReading = $reading;
        } else if ($reading instanceof SystemState) {
            $this->systemStateReading = $reading;
        }
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

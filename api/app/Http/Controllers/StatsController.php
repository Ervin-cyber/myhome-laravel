<?php

namespace App\Http\Controllers;

use App\Models\ClimateRun;
use App\Models\Room;
use App\Models\RoomTemperatureSample;
use App\Models\TemperatureReading;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class StatsController extends Controller
{
    /** The windows the dashboard offers, in hours. */
    private const RANGES = ['24h' => 24, '7d' => 168];

    /**
     * Per-room stats over the last day or week.
     *
     * Each room lists what heats or cools it: the boiler if it is a radiator
     * room, and each of its units. The boiler appears in every radiator room
     * with the same figures, because one relay heats them all -- it is marked
     * shared rather than divided up, since nothing measures how much of the
     * heat went where.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'range' => ['sometimes', 'in:' . implode(',', array_keys(self::RANGES))],
        ]);

        $range = $data['range'] ?? '24h';
        $to = now();
        $from = $to->copy()->subHours(self::RANGES[$range]);

        $runs = ClimateRun::where('started_at', '<', $to)
            ->where(fn ($q) => $q->whereNull('ended_at')->orWhere('ended_at', '>', $from))
            ->get();

        $rooms = Room::with('airConditioners')
            ->where('show_stats', true)
            ->orderBy('sort_order')
            ->get();

        $since = ClimateRun::min('started_at');

        return response()->json([
            'range' => $range,
            // Runs were not recorded before this feature, so a week's figures
            // are a partial week until a week has passed. The dashboard says so.
            'recording_since' => $since ? Carbon::parse($since)->toIso8601String() : null,
            'partial' => $since === null || Carbon::parse($since)->gt($from),
            'rooms' => $rooms->map(fn (Room $room) => [
                'id' => $room->id,
                'name' => $room->name,
                'temperature' => $this->temperatureStats($room, $from),
                'sources' => $this->sourcesFor($room, $runs, $from, $to),
            ])->values(),
        ]);
    }

    private function sourcesFor(Room $room, Collection $runs, Carbon $from, Carbon $to): array
    {
        $sources = [];

        if ($room->heat_source === 'boiler') {
            $sources[] = $this->summarise(
                ['kind' => ClimateRun::SOURCE_BOILER, 'air_conditioner_id' => null, 'name' => 'Boiler', 'shared' => true],
                $runs->where('source', ClimateRun::SOURCE_BOILER),
                $from,
                $to,
            );
        }

        foreach ($room->airConditioners as $ac) {
            $sources[] = $this->summarise(
                ['kind' => ClimateRun::SOURCE_AC, 'air_conditioner_id' => $ac->id, 'name' => $ac->name, 'shared' => false],
                $runs->where('source', ClimateRun::SOURCE_AC)->where('air_conditioner_id', $ac->id),
                $from,
                $to,
            );
        }

        return $sources;
    }

    private function summarise(array $source, Collection $runs, Carbon $from, Carbon $to): array
    {
        return $source + [
            'seconds' => $runs->sum(fn (ClimateRun $run) => $run->secondsWithin($from, $to)),
            // Runs that began inside the window. One already going when the
            // window opened is runtime here but somebody else's start.
            'cycles' => $runs->filter(fn (ClimateRun $run) => $run->started_at->gte($from))->count(),
            'running' => $runs->contains(fn (ClimateRun $run) => $run->ended_at === null
                && $run->confirmed_at->diffInSeconds($to, true) <= config('climate.run_gap_seconds')),
        ];
    }

    /**
     * From wherever this room keeps its history: its own sensor's readings, or
     * the samples taken from its unit.
     */
    private function temperatureStats(Room $room, Carbon $from): ?array
    {
        $query = $room->temp_source === 'ac'
            ? RoomTemperatureSample::where('room_id', $room->id)->where('sampled_at', '>=', $from)
            : TemperatureReading::where('room_id', $room->id)->where('timestamp', '>=', $from);

        $stats = $query->selectRaw('MIN(value) as min, MAX(value) as max, AVG(value) as avg, COUNT(*) as count')->first();

        if (! $stats || (int) $stats->count === 0) {
            return null;
        }

        // The sensor readings are raw; the room shows them with its offset.
        $offset = $room->temp_source === 'ac' ? 0 : (float) $room->calibration_offset;

        return [
            'min' => round((float) $stats->min + $offset, 1),
            'max' => round((float) $stats->max + $offset, 1),
            'avg' => round((float) $stats->avg + $offset, 1),
        ];
    }
}

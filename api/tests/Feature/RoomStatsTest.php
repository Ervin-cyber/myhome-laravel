<?php

namespace Tests\Feature;

use App\Models\AirConditioner;
use App\Models\ClimateRun;
use App\Models\Room;
use App\Models\RoomTemperatureSample;
use App\Models\SystemState;
use App\Models\TemperatureReading;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RoomStatsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeSecond();
        config(['climate.run_gap_seconds' => 300, 'climate.room_sample_seconds' => 300]);
        Sanctum::actingAs(User::factory()->create());
    }

    private function room(string $slug): Room
    {
        return Room::where('slug', $slug)->firstOrFail();
    }

    private function unit(string $mac, string $room): AirConditioner
    {
        return AirConditioner::create([
            'mac' => $mac, 'name' => "Unit {$mac}", 'ip' => '192.168.1.50', 'port' => 7000,
            'room_id' => $this->room($room)->id,
        ]);
    }

    /** What the Pi's live poller sends for one unit it has just read. */
    private function report(AirConditioner $ac, bool $power, array $extra = []): void
    {
        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [array_merge([
                'mac' => $ac->mac, 'name' => $ac->name, 'ip' => $ac->ip, 'port' => 7000,
                'reported_state' => ['power' => $power, 'mode' => 'cool'],
            ], $extra)],
        ])->assertOk();
    }

    private function sourceIn(array $room, string $kind, ?int $acId = null): array
    {
        return collect($room['sources'])
            ->first(fn ($s) => $s['kind'] === $kind && $s['air_conditioner_id'] === $acId);
    }

    private function statsFor(string $slug, string $range = '24h'): array
    {
        $rooms = $this->getJson("/api/stats?range={$range}")->assertOk()->json('rooms');

        return collect($rooms)->firstWhere('id', $this->room($slug)->id);
    }

    public function test_a_unit_run_lasts_from_its_first_on_to_its_first_off(): void
    {
        $ac = $this->unit('aa0000000001', 'living');

        $this->report($ac, true);
        foreach (range(1, 90) as $minute) {
            $this->travel(1)->minutes();
            $this->report($ac, true);
        }
        $this->travel(1)->minutes();
        $this->report($ac, false);

        $run = ClimateRun::sole();
        $this->assertSame(91 * 60, (int) $run->started_at->diffInSeconds($run->ended_at));

        $unit = $this->sourceIn($this->statsFor('living'), 'ac', $ac->id);
        $this->assertSame(91 * 60, $unit['seconds']);
        $this->assertSame(1, $unit['cycles']);
    }

    public function test_a_discovery_scan_does_not_end_a_run(): void
    {
        $ac = $this->unit('aa0000000002', 'living');
        $this->report($ac, true);

        // A scan carries no state; its silence is not "off".
        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [['mac' => $ac->mac, 'name' => $ac->name, 'ip' => $ac->ip]],
            'complete' => true,
        ])->assertOk();

        $this->assertNull(ClimateRun::sole()->ended_at);
    }

    public function test_a_unit_that_goes_quiet_is_not_credited_with_the_silence(): void
    {
        $ac = $this->unit('aa0000000003', 'living');
        $this->report($ac, true);
        foreach (range(1, 10) as $minute) {
            $this->travel(1)->minutes();
            $this->report($ac, true);
        }

        // Silent for three hours, then answers "still on".
        $this->travel(3)->hours();
        $this->report($ac, true);

        $runs = ClimateRun::orderBy('id')->get();
        $this->assertCount(2, $runs, 'The silence splits the run in two.');
        $this->assertEquals($runs[0]->confirmed_at, $runs[0]->ended_at, 'The first ends where it was last seen.');

        $unit = $this->sourceIn($this->statsFor('living'), 'ac', $ac->id);
        $this->assertSame(10 * 60, $unit['seconds'], 'Ten seen minutes, not three hours and ten.');
        $this->assertSame(2, $unit['cycles']);
    }

    public function test_two_units_in_one_room_are_counted_separately(): void
    {
        $first = $this->unit('aa0000000004', 'living');
        $second = $this->unit('aa0000000005', 'living');

        $this->report($first, true);
        $this->report($second, true);

        // Hours of minute-by-minute polls, stood in for by confirming the open
        // runs directly before each switch-off.
        $this->travel(2)->hours();
        ClimateRun::whereNull('ended_at')->update(['confirmed_at' => now()]);
        $this->report($second, false);

        $this->travel(2)->hours();
        ClimateRun::whereNull('ended_at')->update(['confirmed_at' => now()]);
        $this->report($first, false);

        $room = $this->statsFor('living');
        $this->assertSame(4 * 3600, $this->sourceIn($room, 'ac', $first->id)['seconds']);
        $this->assertSame(2 * 3600, $this->sourceIn($room, 'ac', $second->id)['seconds']);
    }

    public function test_runtime_is_clipped_to_the_window(): void
    {
        $ac = $this->unit('aa0000000006', 'living');

        // Started thirty hours ago, still going and confirmed a moment ago.
        ClimateRun::create([
            'source' => 'ac', 'air_conditioner_id' => $ac->id, 'room_id' => $ac->room_id,
            'started_at' => now()->subHours(30), 'confirmed_at' => now(),
        ]);

        $day = $this->sourceIn($this->statsFor('living'), 'ac', $ac->id);
        $this->assertSame(24 * 3600, $day['seconds']);
        $this->assertSame(0, $day['cycles'], 'It started before the window opened.');
        $this->assertTrue($day['running']);

        $week = $this->sourceIn($this->statsFor('living', '7d'), 'ac', $ac->id);
        $this->assertSame(30 * 3600, $week['seconds']);
        $this->assertSame(1, $week['cycles']);
    }

    public function test_the_boiler_runs_from_the_relay_the_pi_reports(): void
    {
        $state = SystemState::firstOrCreate();
        // Enabled, or the controller forces the relay state off on save.
        $state->update(['mode' => 'heating', 'heating_on' => false, 'enabled' => true]);

        $this->postJson('/api/state', ['heating_on' => 1])->assertOk();

        // The Pi reports only on change; its minute poll keeps the run alive.
        foreach (range(1, 45) as $minute) {
            $this->travel(1)->minutes();
            $this->getJson('/api/params')->assertOk();
        }

        $this->postJson('/api/state', ['heating_on' => 0])->assertOk();

        $run = ClimateRun::where('source', 'boiler')->sole();
        $this->assertSame(45 * 60, (int) $run->started_at->diffInSeconds($run->ended_at));

        // One relay, every radiator room: both show it, marked shared.
        foreach (['bedroom', 'living'] as $slug) {
            $boiler = $this->sourceIn($this->statsFor($slug), 'boiler');
            $this->assertSame(45 * 60, $boiler['seconds']);
            $this->assertTrue($boiler['shared']);
        }
    }

    public function test_temperature_stats_come_from_each_rooms_own_history(): void
    {
        $bedroom = $this->room('bedroom');
        $bedroom->update(['sensor_device' => 'esp-bed', 'calibration_offset' => 0]);
        foreach ([20.0, 22.0, 21.0] as $value) {
            TemperatureReading::create(['value' => $value, 'device' => 'esp-bed']);
        }

        foreach ([25.0, 27.0] as $value) {
            RoomTemperatureSample::create(['room_id' => $this->room('living')->id, 'value' => $value, 'sampled_at' => now()]);
        }

        $this->assertSame(['min' => 20.0, 'max' => 22.0, 'avg' => 21.0], $this->statsFor('bedroom')['temperature']);
        $this->assertSame(['min' => 25.0, 'max' => 27.0, 'avg' => 26.0], $this->statsFor('living')['temperature']);
    }

    public function test_a_unit_read_room_is_sampled_at_most_once_an_interval(): void
    {
        $ac = $this->unit('aa0000000007', 'living');

        foreach (range(1, 10) as $minute) {
            $this->report($ac, true, ['reported_temp' => 24]);
            $this->travel(1)->minutes();
        }

        $this->assertSame(2, RoomTemperatureSample::count(), 'Ten readings a minute apart, one sample per five.');
    }

    public function test_a_stale_room_reading_is_not_sampled(): void
    {
        $living = $this->room('living');
        $living->forceFill(['current_temp' => 23, 'current_temp_at' => now()->subHour()])->save();

        app(\App\Services\RunRecorder::class)->sampleRoom($living->fresh());

        $this->assertSame(0, RoomTemperatureSample::count());
    }

    public function test_a_room_can_be_left_out_of_the_stats(): void
    {
        $admin = User::factory()->create();
        $admin->role = User::ROLE_ADMIN;
        $admin->save();
        Sanctum::actingAs($admin);

        $this->postJson("/api/rooms/{$this->room('living')->id}", ['show_stats' => false])->assertOk();

        $ids = collect($this->getJson('/api/stats')->json('rooms'))->pluck('id');
        $this->assertNotContains($this->room('living')->id, $ids);
        $this->assertContains($this->room('bedroom')->id, $ids);
    }

    public function test_a_member_cannot_change_which_rooms_show_stats(): void
    {
        $this->postJson("/api/rooms/{$this->room('living')->id}", ['show_stats' => false])->assertForbidden();
        $this->assertTrue($this->room('living')->show_stats);

        // The same endpoint still takes a member's everyday changes.
        $this->postJson("/api/rooms/{$this->room('living')->id}", ['target_temp' => 22])->assertOk();
    }

    public function test_an_unknown_range_is_rejected(): void
    {
        $this->getJson('/api/stats?range=1y')->assertUnprocessable();
    }
}

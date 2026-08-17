<?php

namespace Tests\Feature;

use App\Models\Room;
use App\Models\SmartPlug;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmartPlugTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());
    }

    private function plug(array $overrides = []): array
    {
        return array_merge([
            'mac' => '1c:3b:f3:00:11:22',
            'name' => 'Tapo P110',
            'ip' => '192.168.1.80',
            'watts' => 640.5,
            'energy_today' => 1.82,
        ], $overrides);
    }

    private function sync(array ...$plugs)
    {
        return $this->postJson('/api/smart-plugs/sync', [
            'plugs' => $plugs ?: [$this->plug()],
        ]);
    }

    public function test_sync_records_the_current_draw_and_the_daily_total(): void
    {
        $this->sync()->assertOk();

        $plug = SmartPlug::firstOrFail();

        $this->assertSame(640.5, $plug->watts);
        $this->assertSame(1.82, $plug->energy_today);
        $this->assertTrue($plug->online);
        $this->assertNotNull($plug->watts_at);
    }

    public function test_a_plug_is_identified_by_mac_not_ip(): void
    {
        $this->sync($this->plug(['ip' => '192.168.1.80']))->assertOk();
        $this->sync($this->plug(['ip' => '192.168.1.91', 'name' => 'Renamed by firmware']))->assertOk();

        $this->assertSame(1, SmartPlug::count(), 'A new DHCP lease is the same plug.');
        $this->assertSame('192.168.1.91', SmartPlug::first()->ip);
    }

    public function test_sync_does_not_overwrite_a_rename(): void
    {
        $this->sync()->assertOk();

        $plug = SmartPlug::firstOrFail();
        $plug->update(['name' => 'Air conditioners']);

        $this->sync()->assertOk();

        $this->assertSame('Air conditioners', $plug->fresh()->name);
    }

    public function test_a_plug_is_placed_from_config(): void
    {
        config(['climate.plug_rooms' => ['1c3bf3001122' => 'bedroom']]);

        // Separators and case differ from the config entry on purpose.
        $this->sync($this->plug(['mac' => '1C:3B:F3:00:11:22']))->assertOk();

        $this->assertSame(
            Room::where('slug', 'bedroom')->value('id'),
            SmartPlug::first()->room_id
        );
    }

    public function test_a_plug_covering_several_rooms_stays_house_wide(): void
    {
        $this->sync()->assertOk();

        $this->assertNull(
            SmartPlug::first()->room_id,
            'A total across rooms must not be attributed to one of them.'
        );
    }

    public function test_a_plug_that_drops_off_the_network_reports_no_wattage(): void
    {
        $this->sync()->assertOk();

        // A scan that finds nothing, rather than a scan reporting an empty plug.
        $this->postJson('/api/smart-plugs/sync', ['plugs' => []])->assertOk();

        $plug = SmartPlug::firstOrFail();

        $this->assertFalse($plug->online);
        $this->assertNull(
            $plug->watts,
            'A silent plug means we do not know the draw, not that the draw is zero.'
        );
    }

    public function test_the_draw_says_what_is_running_downstream(): void
    {
        $plug = SmartPlug::create(['mac' => 'aa', 'name' => 'p', 'watts' => 4, 'watts_at' => now()]);
        $this->assertSame('idle', $plug->activity);

        $plug->update(['watts' => 45]);
        $this->assertSame('fan', $plug->activity, 'Fan without compressor draws tens of watts.');

        $plug->update(['watts' => 700]);
        $this->assertSame('compressor', $plug->activity);
    }

    public function test_a_stale_reading_claims_nothing(): void
    {
        $plug = SmartPlug::create([
            'mac' => 'bb',
            'name' => 'p',
            'watts' => 0,
            'watts_at' => now()->subSeconds(SmartPlug::FRESH_SECONDS + 60),
        ]);

        $this->assertSame(
            'unknown',
            $plug->activity,
            'An old zero is not evidence that nothing is running.'
        );
    }

    public function test_a_plug_can_be_assigned_to_a_room(): void
    {
        $this->sync()->assertOk();

        $plug = SmartPlug::firstOrFail();
        $bedroom = Room::where('slug', 'bedroom')->firstOrFail();

        $this->postJson("/api/smart-plugs/{$plug->id}", ['room_id' => $bedroom->id])
            ->assertOk()
            ->assertJsonPath('room_id', $bedroom->id);
    }
}

<?php

namespace Tests\Feature;

use App\Models\AirConditioner;
use App\Models\Room;
use App\Models\SystemState;
use App\Models\TemperatureReading;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RoomTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());
    }

    private function bedroom(): Room
    {
        return Room::where('slug', 'bedroom')->firstOrFail();
    }

    private function living(): Room
    {
        return Room::where('slug', 'living')->firstOrFail();
    }

    public function test_migration_seeds_the_two_zones(): void
    {
        $this->assertSame(2, Room::count());

        $this->assertTrue($this->bedroom()->drives_boiler, 'The bedroom thermostat owns the boiler relay.');
        $this->assertFalse($this->living()->drives_boiler, 'Only one room may drive the single house relay.');

        $this->assertSame('sensor', $this->bedroom()->temp_source);
        $this->assertSame('ac', $this->living()->temp_source, 'The living area reads its Gree unit.');
    }

    public function test_a_reading_is_routed_to_the_room_that_declares_the_sensor(): void
    {
        $bedroom = $this->bedroom();
        $bedroom->update(['sensor_device' => 'esp-bedroom']);

        $reading = TemperatureReading::create(['value' => 21.5, 'device' => 'esp-bedroom']);

        $this->assertSame($bedroom->id, $reading->room_id);
        $this->assertSame(21.5, $bedroom->fresh()->current_temp);
    }

    public function test_a_reading_from_an_unknown_sensor_is_not_attached_to_a_room(): void
    {
        $reading = TemperatureReading::create(['value' => 21.5, 'device' => 'esp-garage']);

        $this->assertNull($reading->room_id);
    }

    public function test_a_room_without_its_own_sensor_reads_its_air_conditioner(): void
    {
        $living = $this->living();

        AirConditioner::create([
            'room_id' => $living->id,
            'mac' => 'aa:bb:cc:dd:ee:02',
            'name' => 'Living',
            'ip' => '192.168.1.51',
            'reported_temp' => 26.0,
            'reported_at' => now(),
            'calibration_offset' => -1.5,
        ]);

        // Gree units sit high in their own return airflow and read warm, so the
        // offset is part of the reading, not a display detail.
        $this->assertSame(24.5, $living->fresh()->readCurrentTemp());
    }

    public function test_a_room_with_no_usable_source_reports_null_rather_than_a_default(): void
    {
        $this->assertNull($this->living()->readCurrentTemp());
    }

    public function test_boost_minutes_are_resolved_to_a_timestamp_per_room(): void
    {
        $living = $this->living();

        $this->postJson("/api/rooms/{$living->id}", ['hvac_until' => 30])->assertOk();

        $living->refresh();

        $this->assertEqualsWithDelta(time() + 1800, $living->hvac_until, 5);
        $this->assertTrue($living->is_boosting);

        // The other room must be unaffected: boost is per room.
        $this->assertSame(0, $this->bedroom()->hvac_until);
        $this->assertFalse($this->bedroom()->is_boosting);
    }

    public function test_boost_can_be_cancelled(): void
    {
        $living = $this->living();
        $living->update(['hvac_until' => time() + 1800]);

        $this->postJson("/api/rooms/{$living->id}", ['hvac_until' => 0])->assertOk();

        $this->assertSame(0, $living->fresh()->hvac_until);
    }

    public function test_a_boosting_room_is_active_even_when_switched_off(): void
    {
        $living = $this->living();
        $living->update(['enabled' => false, 'hvac_until' => time() + 900]);

        $this->assertTrue($living->isActive());
    }

    public function test_rooms_hold_independent_targets(): void
    {
        $this->postJson("/api/rooms/{$this->bedroom()->id}", ['target_temp' => 21])->assertOk();
        $this->postJson("/api/rooms/{$this->living()->id}", ['target_temp' => 25])->assertOk();

        $this->assertSame(21.0, $this->bedroom()->target_temp);
        $this->assertSame(25.0, $this->living()->target_temp);
    }

    public function test_a_target_outside_the_supported_range_is_rejected(): void
    {
        $this->postJson("/api/rooms/{$this->bedroom()->id}", ['target_temp' => 45])
            ->assertStatus(422);
    }

    public function test_an_air_conditioner_can_be_assigned_to_a_room(): void
    {
        $ac = AirConditioner::create([
            'mac' => 'aa:bb:cc:dd:ee:01',
            'name' => 'Gree',
            'ip' => '192.168.1.50',
        ]);

        $this->assertNull($ac->room_id, 'Discovered units start unassigned.');

        $this->postJson("/api/air-conditioners/{$ac->id}", ['room_id' => $this->living()->id])
            ->assertOk()
            ->assertJson(['room_id' => $this->living()->id]);

        $this->assertSame($this->living()->id, $ac->fresh()->room_id);
    }

    public function test_the_legacy_state_endpoint_stays_in_step_with_the_boiler_room(): void
    {
        SystemState::firstOrCreate();

        $this->postJson('/api/state', ['target_temp' => 22, 'mode' => 'heating'])->assertOk();

        $this->assertSame(22.0, $this->bedroom()->target_temp);
    }

    public function test_rooms_are_broadcast_with_their_units(): void
    {
        AirConditioner::create([
            'room_id' => $this->living()->id,
            'mac' => 'aa:bb:cc:dd:ee:02',
            'name' => 'Living',
            'ip' => '192.168.1.51',
        ]);

        $response = $this->getJson('/api/rooms')->assertOk();

        $rooms = $response->json();

        $this->assertCount(2, $rooms);
        $this->assertSame('Bedroom', $rooms[0]['name'], 'Rooms come back in sort order.');
        $this->assertCount(1, $rooms[1]['air_conditioners']);
    }
}

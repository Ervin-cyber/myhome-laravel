<?php

namespace Tests\Feature;

use App\Models\AirConditioner;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AirConditionerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->create());
    }

    private function device(array $overrides = []): array
    {
        return array_merge([
            'mac' => 'aa:bb:cc:dd:ee:01',
            'name' => 'Gree',
            'ip' => '192.168.1.50',
            'port' => 7000,
        ], $overrides);
    }

    public function test_sync_places_known_units_in_their_configured_room(): void
    {
        config(['climate.ac_rooms' => ['580d0d3b0096' => 'bedroom']]);

        // Separators and case differ from the config entry on purpose.
        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['mac' => '58:0D:0D:3B:00:96'])],
        ])->assertOk();

        $ac = AirConditioner::where('mac', '58:0D:0D:3B:00:96')->firstOrFail();

        $this->assertSame(
            Room::where('slug', 'bedroom')->value('id'),
            $ac->room_id,
            'A unit is bolted to a wall; discovery should place it without help.'
        );
    }

    public function test_sync_does_not_override_a_room_chosen_in_the_dashboard(): void
    {
        config(['climate.ac_rooms' => ['580d0d3b0096' => 'bedroom']]);

        $living = Room::where('slug', 'living')->firstOrFail();
        AirConditioner::create($this->device(['mac' => '580d0d3b0096', 'room_id' => $living->id]));

        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['mac' => '580d0d3b0096'])],
        ])->assertOk();

        $this->assertSame(
            $living->id,
            AirConditioner::where('mac', '580d0d3b0096')->value('room_id'),
            'Config fills a gap; it does not overrule a deliberate choice.'
        );
    }

    public function test_sync_leaves_an_unknown_unit_unassigned(): void
    {
        config(['climate.ac_rooms' => ['580d0d3b0096' => 'bedroom']]);

        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['mac' => 'aa:bb:cc:dd:ee:09'])],
        ])->assertOk();

        $this->assertNull(AirConditioner::where('mac', 'aa:bb:cc:dd:ee:09')->value('room_id'));
    }

    public function test_sync_preserves_user_settings_and_renames(): void
    {
        $ac = AirConditioner::create([
            'mac' => 'aa:bb:cc:dd:ee:01',
            'name' => 'Bedroom',
            'ip' => '192.168.1.50',
            'port' => 7000,
            'target_temp' => 21,
            'enabled' => false,
        ]);

        // A rescan reports the unit's factory name and a new DHCP address.
        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['name' => 'Gree', 'ip' => '192.168.1.77'])],
        ])->assertOk();

        $ac->refresh();

        $this->assertSame('Bedroom', $ac->name, 'A rescan must not overwrite a user rename.');
        $this->assertSame(21, $ac->target_temp);
        $this->assertFalse($ac->enabled);
        $this->assertSame('192.168.1.77', $ac->ip, 'A new DHCP lease should be picked up.');
        $this->assertTrue($ac->online);
    }

    public function test_sync_identifies_units_by_mac_not_ip(): void
    {
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom', 'ip' => '192.168.1.50']));
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:02', 'name' => 'Living', 'ip' => '192.168.1.51']));

        // The two units swap addresses after a router reboot.
        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [
                $this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'ip' => '192.168.1.51']),
                $this->device(['mac' => 'aa:bb:cc:dd:ee:02', 'ip' => '192.168.1.50']),
            ],
        ])->assertOk();

        $this->assertSame(2, AirConditioner::count());
        $this->assertSame('192.168.1.51', AirConditioner::where('mac', 'aa:bb:cc:dd:ee:01')->value('ip'));
        $this->assertSame('Living', AirConditioner::where('mac', 'aa:bb:cc:dd:ee:02')->value('name'));
    }

    public function test_a_complete_sync_flags_missing_units_offline_instead_of_deleting(): void
    {
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom']));
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:02', 'name' => 'Living', 'ip' => '192.168.1.51']));

        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom'])],
            'complete' => true,
        ])->assertOk()->assertJson(['synced' => 1, 'offline' => 1]);

        $this->assertSame(2, AirConditioner::count());
        $this->assertTrue(AirConditioner::where('mac', 'aa:bb:cc:dd:ee:01')->value('online'));
        $this->assertFalse((bool) AirConditioner::where('mac', 'aa:bb:cc:dd:ee:02')->value('online'));
    }

    /**
     * Only a discovery scan has looked at the whole network, so only a discovery
     * scan may conclude that a unit is gone.
     *
     * Three of the Pi's four sync callers report just the units that answered
     * this pass, and under "command only when asked" a command pass carries one
     * unit. Sweeping on those payloads meant commanding the bedroom declared the
     * living room offline.
     */
    public function test_a_partial_sync_leaves_the_units_it_did_not_mention_alone(): void
    {
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom']));
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:02', 'name' => 'Living', 'ip' => '192.168.1.51']));

        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom'])],
        ])->assertOk()->assertJson(['synced' => 1, 'offline' => 0]);

        $this->assertTrue((bool) AirConditioner::where('mac', 'aa:bb:cc:dd:ee:02')->value('online'));
    }

    /**
     * A unit that has stopped answering is the case that cost an hour: a Gree's
     * wifi module can wedge while the unit runs on, and nothing downstream
     * noticed. `responding` is the signal, and it is distinct from `online`.
     */
    public function test_a_unit_that_has_stopped_answering_is_not_responding(): void
    {
        $ac = AirConditioner::create($this->device());

        $ac->forceFill(['observed_at' => null])->save();
        $this->assertNull($ac->fresh()->responding, 'never asked is not the same as not answering');
        $this->assertNull($ac->fresh()->silent_for);

        $ac->forceFill(['observed_at' => now()->subSeconds(AirConditioner::RESPONSIVE_WITHIN_SECONDS - 5)])->save();
        $this->assertTrue($ac->fresh()->responding);
        $this->assertNull($ac->fresh()->silent_for);

        $ac->forceFill(['observed_at' => now()->subSeconds(AirConditioner::RESPONSIVE_WITHIN_SECONDS + 5)])->save();
        $this->assertFalse($ac->fresh()->responding);
        $this->assertGreaterThan(AirConditioner::RESPONSIVE_WITHIN_SECONDS, $ac->fresh()->silent_for);
    }

    /** Answering and being found by a scan are different questions. */
    public function test_a_unit_can_be_online_and_still_not_responding(): void
    {
        $ac = AirConditioner::create($this->device());

        $ac->forceFill([
            'online' => true,
            'observed_at' => now()->subSeconds(AirConditioner::RESPONSIVE_WITHIN_SECONDS + 60),
        ])->save();

        $this->assertTrue((bool) $ac->fresh()->online);
        $this->assertFalse($ac->fresh()->responding);
    }

    public function test_sync_records_the_units_own_indoor_reading(): void
    {
        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['reported_temp' => 26.5])],
        ])->assertOk();

        $ac = AirConditioner::first();

        $this->assertSame(26.5, $ac->reported_temp);
        $this->assertNotNull($ac->reported_at);
    }

    public function test_update_rejects_a_target_outside_the_supported_range(): void
    {
        $ac = AirConditioner::create($this->device(['target_temp' => 24]));

        $this->postJson("/api/air-conditioners/{$ac->id}", ['target_temp' => 40])
            ->assertStatus(422);

        $this->assertSame(24, $ac->fresh()->target_temp);
    }

    public function test_update_returns_the_saved_unit(): void
    {
        $ac = AirConditioner::create($this->device(['target_temp' => 24]));

        $this->postJson("/api/air-conditioners/{$ac->id}", ['target_temp' => 22])
            ->assertOk()
            ->assertJson(['id' => $ac->id, 'target_temp' => 22]);
    }
}

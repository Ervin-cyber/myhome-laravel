<?php

namespace Tests\Feature;

use App\Models\AirConditioner;
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

    public function test_sync_flags_missing_units_offline_instead_of_deleting(): void
    {
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom']));
        AirConditioner::create($this->device(['mac' => 'aa:bb:cc:dd:ee:02', 'name' => 'Living', 'ip' => '192.168.1.51']));

        $this->postJson('/api/air-conditioners/sync', [
            'devices' => [$this->device(['mac' => 'aa:bb:cc:dd:ee:01', 'name' => 'Bedroom'])],
        ])->assertOk()->assertJson(['synced' => 1, 'offline' => 1]);

        $this->assertSame(2, AirConditioner::count());
        $this->assertTrue(AirConditioner::where('mac', 'aa:bb:cc:dd:ee:01')->value('online'));
        $this->assertFalse((bool) AirConditioner::where('mac', 'aa:bb:cc:dd:ee:02')->value('online'));
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

<?php

namespace Tests\Feature;

use App\Models\AirConditioner;
use App\Models\Room;
use App\Models\SystemState;
use App\Services\ClimateService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClimateServiceTest extends TestCase
{
    use RefreshDatabase;

    private ClimateService $climate;

    protected function setUp(): void
    {
        parent::setUp();

        $this->climate = app(ClimateService::class);
    }

    private function house(array $state = []): SystemState
    {
        SystemState::query()->delete();

        return SystemState::create(array_merge([
            'mode' => 'heating',
            'enabled' => true,
            'target_temp' => 21,
            'hvac_until' => 0,
            'heating_on' => false,
            'cooling_on' => false,
        ], $state));
    }

    private function room(string $slug, array $defaults, array $attributes): Room
    {
        $room = Room::where('slug', $slug)->firstOrFail();
        $room->fill(array_merge($defaults, $attributes));
        $room->save();

        return $room;
    }

    private function bedroom(array $attributes = []): Room
    {
        return $this->room('bedroom', [
            'target_temp' => 21,
            'enabled' => true,
            'current_temp' => 21,
            'hvac_until' => 0,
        ], $attributes);
    }

    private function living(array $attributes = []): Room
    {
        return $this->room('living', [
            'target_temp' => 24,
            'enabled' => true,
            'current_temp' => 24,
            'hvac_until' => 0,
        ], $attributes);
    }

    private function unit(Room $room, array $attributes = []): AirConditioner
    {
        return AirConditioner::create(array_merge([
            'room_id' => $room->id,
            'name' => $room->name . ' AC',
            'mac' => 'aa:bb:cc:dd:ee:' . str_pad((string) $room->id, 2, '0', STR_PAD_LEFT),
            'ip' => '192.168.1.5' . $room->id,
            'port' => 7000,
            'enabled' => true,
            'target_temp' => 24,
        ], $attributes));
    }

    private function unitFor(array $control, string $mac): ?array
    {
        foreach ($control['units'] as $unit) {
            if ($unit['mac'] === $mac) {
                return $unit;
            }
        }

        return null;
    }

    public function test_boiler_runs_when_the_reference_room_is_below_target(): void
    {
        $this->house(['mode' => 'heating']);
        $this->bedroom(['target_temp' => 21, 'current_temp' => 20.0]);

        $this->assertTrue($this->climate->evaluate()['boiler']);
    }

    public function test_boiler_stays_off_inside_the_deadband(): void
    {
        $this->house(['mode' => 'heating', 'heating_on' => false]);
        $this->bedroom(['target_temp' => 21, 'current_temp' => 20.95]);

        $this->assertFalse($this->climate->evaluate()['boiler']);
    }

    public function test_boiler_keeps_running_until_it_passes_the_upper_deadband(): void
    {
        // Already heating and just above target: hysteresis must hold it on.
        $this->house(['mode' => 'heating', 'heating_on' => true]);
        $this->bedroom(['target_temp' => 21, 'current_temp' => 21.1]);

        $this->assertTrue($this->climate->evaluate()['boiler']);

        $this->bedroom(['target_temp' => 21, 'current_temp' => 21.3]);

        $this->assertFalse($this->climate->evaluate()['boiler']);
    }

    public function test_boiler_stays_off_when_the_reference_room_has_no_reading(): void
    {
        $this->house(['mode' => 'heating']);
        $this->bedroom(['current_temp' => null]);

        $this->assertFalse(
            $this->climate->evaluate()['boiler'],
            'A missing reading must never be treated as a call for heat.'
        );
    }

    public function test_boiler_stays_off_on_an_implausible_reading(): void
    {
        $this->house(['mode' => 'heating']);
        $this->bedroom(['current_temp' => -40]);

        $this->assertFalse($this->climate->evaluate()['boiler']);
    }

    public function test_master_switch_off_stops_everything(): void
    {
        $this->house(['mode' => 'heating', 'enabled' => false]);
        $this->bedroom(['current_temp' => 15]);
        $living = $this->living();
        $ac = $this->unit($living);

        $control = $this->climate->evaluate();

        $this->assertFalse($control['boiler']);
        $this->assertFalse($this->unitFor($control, $ac->mac)['power']);
    }

    public function test_a_room_boost_overrides_the_master_switch(): void
    {
        $this->house(['mode' => 'heating', 'enabled' => false]);
        $this->bedroom(['current_temp' => 25, 'hvac_until' => time() + 900]);

        $this->assertTrue(
            $this->climate->evaluate()['boiler'],
            'Boost must force heat even above target and with the house switched off.'
        );
    }

    public function test_an_expired_boost_no_longer_forces_heat(): void
    {
        $this->house(['mode' => 'heating', 'enabled' => false]);
        $this->bedroom(['current_temp' => 25, 'hvac_until' => time() - 60]);

        $this->assertFalse($this->climate->evaluate()['boiler']);
    }

    public function test_cooling_drives_each_room_independently(): void
    {
        $this->house(['mode' => 'cooling']);
        $bedroom = $this->bedroom(['target_temp' => 22, 'enabled' => true]);
        $living = $this->living(['target_temp' => 25, 'enabled' => false]);

        $bedroomAc = $this->unit($bedroom);
        $livingAc = $this->unit($living);

        $control = $this->climate->evaluate();

        $this->assertFalse($control['boiler']);

        $bedroomUnit = $this->unitFor($control, $bedroomAc->mac);
        $this->assertTrue($bedroomUnit['power']);
        $this->assertSame(22, $bedroomUnit['target_temp'], 'The room owns the setpoint.');
        $this->assertSame('cool', $bedroomUnit['mode']);

        $this->assertFalse(
            $this->unitFor($control, $livingAc->mac)['power'],
            'A switched-off room must not run its unit.'
        );
    }

    public function test_units_stay_off_in_heating_mode_for_boiler_heated_rooms(): void
    {
        $this->house(['mode' => 'heating']);
        $living = $this->living(['heat_source' => 'boiler']);
        $ac = $this->unit($living);

        $control = $this->climate->evaluate();

        $this->assertFalse($this->unitFor($control, $ac->mac)['power']);
    }

    public function test_a_room_heated_by_its_unit_runs_it_as_a_heat_pump(): void
    {
        $this->house(['mode' => 'heating']);
        $this->bedroom(['current_temp' => 25]);
        $living = $this->living([
            'heat_source' => 'ac',
            'target_temp' => 22,
            'current_temp' => 19,
        ]);
        $ac = $this->unit($living);

        $unit = $this->unitFor($this->climate->evaluate(), $ac->mac);

        $this->assertTrue($unit['power']);
        $this->assertSame('heat', $unit['mode']);
        $this->assertSame(22, $unit['target_temp']);
    }

    public function test_a_disabled_unit_never_runs(): void
    {
        $this->house(['mode' => 'cooling']);
        $living = $this->living(['enabled' => true]);
        $ac = $this->unit($living, ['enabled' => false]);

        $this->assertFalse($this->unitFor($this->climate->evaluate(), $ac->mac)['power']);
    }

    public function test_a_unit_is_not_restarted_before_the_compressor_settles(): void
    {
        $this->house(['mode' => 'cooling']);
        $living = $this->living();
        $ac = $this->unit($living, [
            'cooling_on' => false,
            'power_changed_at' => now()->subSeconds(30),
        ]);

        $this->assertFalse(
            $this->unitFor($this->climate->evaluate(), $ac->mac)['power'],
            'Restarting a compressor 30s after stopping it damages the unit.'
        );

        $ac->update(['power_changed_at' => now()->subSeconds(ClimateService::AC_MIN_OFF_SECONDS + 10)]);

        $this->assertTrue($this->unitFor($this->climate->evaluate(), $ac->mac)['power']);
    }

    public function test_unassigned_units_follow_the_house_using_their_own_setpoint(): void
    {
        $this->house(['mode' => 'cooling']);

        $ac = AirConditioner::create([
            'room_id' => null,
            'name' => 'Unassigned',
            'mac' => 'aa:bb:cc:dd:ee:99',
            'ip' => '192.168.1.99',
            'enabled' => true,
            'target_temp' => 23,
        ]);

        $unit = $this->unitFor($this->climate->evaluate(), $ac->mac);

        $this->assertTrue($unit['power']);
        $this->assertSame(23, $unit['target_temp']);
    }

    public function test_the_document_carries_an_expiry_for_the_pi_watchdog(): void
    {
        $this->house();

        $control = $this->climate->evaluate();

        $this->assertSame(2, $control['v']);
        $this->assertGreaterThan(time(), $control['expires_at']);
    }

    public function test_room_state_is_persisted_for_the_dashboard(): void
    {
        $this->house(['mode' => 'cooling']);
        $living = $this->living(['enabled' => true]);
        $this->unit($living);

        $this->climate->evaluate();

        $this->assertTrue($living->fresh()->cooling_on);
    }
}

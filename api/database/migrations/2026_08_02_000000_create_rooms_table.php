<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('icon')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->float('target_temp')->default(21);
            $table->boolean('enabled')->default(true);
            // Per-room boost, stored as a unix timestamp. 0 means no boost.
            $table->integer('hvac_until')->default(0);

            // Where this room's temperature is read from.
            // sensor = an ESP device, ac = the Gree unit's own indoor sensor.
            $table->string('temp_source')->default('sensor');
            $table->string('sensor_device')->nullable();
            $table->float('calibration_offset')->default(0);

            // How the room is heated in winter. Rooms on 'boiler' share the
            // single house relay; 'ac' would run the Gree unit as a heat pump.
            $table->string('heat_source')->default('boiler');
            // Only this room's thermostat opens the boiler relay.
            $table->boolean('drives_boiler')->default(false);

            $table->float('current_temp')->nullable();
            $table->timestamp('current_temp_at')->nullable();
            $table->boolean('heating_on')->default(false);
            $table->boolean('cooling_on')->default(false);

            $table->timestamps();
        });

        $this->seedInitialRooms();
    }

    /**
     * Carry the existing single-zone setup over into two rooms so the system
     * behaves identically the moment this migration lands.
     */
    private function seedInitialRooms(): void
    {
        $targetTemp = DB::table('system_states')->value('target_temp') ?? 21;

        // Whichever device reported most recently is the existing bedroom sensor.
        $sensorDevice = DB::table('temperature_readings')
            ->whereNotNull('device')
            ->where('device', '!=', '')
            ->orderByDesc('timestamp')
            ->value('device');

        $now = now();

        DB::table('rooms')->insert([
            [
                'name' => 'Bedroom',
                'slug' => 'bedroom',
                'icon' => 'bed',
                'sort_order' => 1,
                'target_temp' => $targetTemp,
                'enabled' => true,
                'hvac_until' => 0,
                'temp_source' => 'sensor',
                'sensor_device' => $sensorDevice,
                'calibration_offset' => 0,
                'heat_source' => 'boiler',
                'drives_boiler' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Living Area',
                'slug' => 'living',
                'icon' => 'sofa',
                'sort_order' => 2,
                'target_temp' => $targetTemp,
                'enabled' => true,
                'hvac_until' => 0,
                // No ESP sensor of its own: the Gree unit's indoor reading is the source.
                'temp_source' => 'ac',
                'sensor_device' => null,
                'calibration_offset' => 0,
                // Radiators cover this area today; the AC here is cooling-only.
                'heat_source' => 'boiler',
                'drives_boiler' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('rooms');
    }
};

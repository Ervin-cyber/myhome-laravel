<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            // Heating vs cooling stays a single house decision. A room may opt
            // out of it into dry or fan, which are comfort choices rather than
            // a call on what season it is. Null means "follow the house".
            $table->string('mode_override')->nullable();
        });

        Schema::table('air_conditioners', function (Blueprint $table) {
            // Whether the unit is running at all. Cannot be inferred from
            // cooling_on/heating_on any more: in fan mode a unit is powered
            // while doing neither.
            $table->boolean('power_on')->default(false);
            $table->string('fan_speed')->default('auto');
            $table->string('swing_vertical')->default('off');
            $table->string('swing_horizontal')->default('off');

            // Gree's own post-cooling coil dry, marketed as X-Fan or Blow. The
            // firmware runs the fan on for a few minutes after the compressor
            // stops so the evaporator does not sit wet and grow mould. Doing
            // this ourselves would mean a purge that has to survive a reboot,
            // an expired control document and the watchdog fail-safe.
            $table->boolean('xfan')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('mode_override');
        });

        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn(['power_on', 'fan_speed', 'swing_vertical', 'swing_horizontal', 'xfan']);
        });
    }
};

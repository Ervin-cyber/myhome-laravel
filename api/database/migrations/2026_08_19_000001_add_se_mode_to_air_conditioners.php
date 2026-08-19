<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // Gree's SE, or economy, mode -- SvSt on the wire. It caps how hard
            // the compressor is allowed to work, which is the nearest thing the
            // protocol has to "run as gently as you can": there is no way to
            // ask for a compressor speed directly.
            //
            // It will not go below the inverter's own floor -- a unit that
            // cannot draw less than 380W will still not -- but it stops the
            // unit reaching for full output, which is what makes a room
            // overshoot a setpoint it is already close to.
            $table->boolean('power_save')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn('power_save');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('air_conditioners', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('ip');
            $table->string('mac')->unique();
            $table->integer('port')->default(7000);
            $table->integer('target_temp')->default(24);
            $table->boolean('enabled')->default(true);
            $table->string('mode')->default('cooling');
            $table->boolean('heating_on')->default(false);
            $table->boolean('cooling_on')->default(false);

            // Discovery bookkeeping: units are never deleted on rescan, only flagged
            $table->boolean('online')->default(true);
            $table->timestamp('last_seen_at')->nullable();

            // The unit's own indoor sensor, used as a room temperature source
            // and shown as a secondary reading in rooms that also have an ESP sensor.
            $table->float('reported_temp')->nullable();
            $table->timestamp('reported_at')->nullable();
            $table->float('calibration_offset')->default(0);

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('air_conditioners');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per run of the boiler or of a unit, from switching on to
        // switching off. Runtime over any window is then the overlap of each
        // run with it, which counts a run that straddles the window's edge and
        // one still going without either being a special case.
        Schema::create('climate_runs', function (Blueprint $table) {
            $table->id();
            $table->string('source', 16);
            // Null for the boiler: one relay heats every radiator room, so its
            // runs belong to the house rather than to a room.
            $table->foreignId('air_conditioner_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('room_id')->nullable()->constrained()->nullOnDelete();
            $table->string('mode', 16)->nullable();
            $table->timestamp('started_at');
            // The last moment the run was actually seen running. An open run is
            // counted up to here, not up to now, so a unit that stops answering
            // mid-run is not credited with weeks of runtime.
            $table->timestamp('confirmed_at');
            $table->timestamp('ended_at')->nullable();

            $table->index(['source', 'air_conditioner_id', 'ended_at']);
            $table->index('started_at');
        });

        // History for rooms that read their temperature off a unit. Those rooms
        // never had any: the unit's reading lived on its own row and was
        // overwritten every minute.
        Schema::create('room_temperature_samples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->float('value');
            $table->timestamp('sampled_at');

            $table->index(['room_id', 'sampled_at']);
        });

        Schema::table('rooms', function (Blueprint $table) {
            $table->boolean('show_stats')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('show_stats');
        });

        Schema::dropIfExists('room_temperature_samples');
        Schema::dropIfExists('climate_runs');
    }
};

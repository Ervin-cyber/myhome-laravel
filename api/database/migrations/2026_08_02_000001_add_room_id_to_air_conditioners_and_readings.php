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
        Schema::table('air_conditioners', function (Blueprint $table) {
            // Left null on discovery: units are assigned to a room from the UI.
            $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
        });

        Schema::table('temperature_readings', function (Blueprint $table) {
            $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
            $table->index(['room_id', 'timestamp']);
        });

        // Every reading so far predates zoning and came from the bedroom sensor.
        $bedroomId = DB::table('rooms')->where('slug', 'bedroom')->value('id');

        if ($bedroomId) {
            DB::table('temperature_readings')->update(['room_id' => $bedroomId]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropForeign(['room_id']);
            $table->dropColumn('room_id');
        });

        Schema::table('temperature_readings', function (Blueprint $table) {
            $table->dropForeign(['room_id']);
            $table->dropIndex(['room_id', 'timestamp']);
            $table->dropColumn('room_id');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            // Separate from show_air_conditioners: the plugs' wattage is worth
            // watching even in a season when the units themselves are not.
            $table->boolean('show_power_usage')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            $table->dropColumn('show_power_usage');
        });
    }
};

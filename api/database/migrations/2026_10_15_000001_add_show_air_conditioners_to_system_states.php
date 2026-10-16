<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            // What the dashboard shows, not what the house does. Hidden units
            // are still run by the control loop exactly as before.
            $table->boolean('show_air_conditioners')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            $table->dropColumn('show_air_conditioners');
        });
    }
};

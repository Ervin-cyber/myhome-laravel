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
        Schema::table('system_states', function (Blueprint $table) {
            // mode: 'heating' atau 'cooling'
            $table->string('mode', 10)->default('heating')->after('heating_on');
            
            // cooling_on: boolean (1/0) seperti heating_on
            $table->boolean('cooling_on')->default(false)->after('mode');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            $table->dropColumn(['mode', 'cooling_on']);
        });
    }
};

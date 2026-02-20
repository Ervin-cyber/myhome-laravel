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
        Schema::table('temperature_readings', function (Blueprint $table) {
            $table->string('device')->nullable();
            $table->string('rssi')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('temperature_readings', function (Blueprint $table) {
            $table->dropColumn(['device', 'rssi']);
        });
    }
};

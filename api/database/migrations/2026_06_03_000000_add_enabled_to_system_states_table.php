<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            $table->boolean('enabled')->default(true)->after('id');
        });

        // If mode was 'off', set enabled to false and mode to 'heating'
        DB::table('system_states')->where('mode', 'off')->update([
            'enabled' => false,
            'mode' => 'heating'
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            $table->dropColumn('enabled');
        });
    }
};

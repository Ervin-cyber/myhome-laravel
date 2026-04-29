<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            if (! Schema::hasColumn('system_states', 'hvac_until')) {
                $table->integer('hvac_until')->default(0)->after('target_temp');
            }
        });

        if (Schema::hasColumn('system_states', 'heating_until')) {
            DB::table('system_states')->update([
                'hvac_until' => DB::raw('COALESCE(heating_until, 0)'),
            ]);

            Schema::table('system_states', function (Blueprint $table) {
                $table->dropColumn('heating_until');
            });
        }
    }

    public function down(): void
    {
        Schema::table('system_states', function (Blueprint $table) {
            if (! Schema::hasColumn('system_states', 'heating_until')) {
                $table->integer('heating_until')->default(0)->after('target_temp');
            }
        });

        if (Schema::hasColumn('system_states', 'hvac_until')) {
            DB::table('system_states')->update([
                'heating_until' => DB::raw('COALESCE(hvac_until, 0)'),
            ]);

            Schema::table('system_states', function (Blueprint $table) {
                $table->dropColumn('hvac_until');
            });
        }
    }
};

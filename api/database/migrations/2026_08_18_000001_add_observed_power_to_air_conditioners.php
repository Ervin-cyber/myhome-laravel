<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // power_on is what we asked for. This is what the unit answered
            // when last asked, which is not the same thing: someone with the
            // remote, a dropped command or a brief outage all leave the two
            // disagreeing, and until now nothing in the system could see it.
            //
            // Nullable because "nobody has asked recently" is a real state and
            // must not be recorded as "off".
            $table->boolean('observed_power_on')->nullable();
            $table->timestamp('observed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn(['observed_power_on', 'observed_at']);
        });
    }
};

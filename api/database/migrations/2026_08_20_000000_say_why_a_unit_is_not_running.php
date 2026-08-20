<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // Why this unit is not running, in the loop's own words.
            //
            // Every reason for holding a unit off was invisible from outside:
            // power was simply false, the room read as idle, and its switch
            // appeared to do nothing. Twice that has cost a debugging session
            // over behaviour that was working exactly as designed -- once for
            // the compressor guard, once for the idle margin.
            //
            // Written by ClimateService where the decision is actually made,
            // rather than guessed at by the dashboard from the values it can
            // see. A guess would be a second implementation of the rules, free
            // to drift from the first.
            $table->string('hold_reason')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn('hold_reason');
        });
    }
};

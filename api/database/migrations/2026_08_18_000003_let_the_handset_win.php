<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // What a person did to this unit at the handset or in the Gree app,
            // and when. Null means nobody has, and the control loop decides.
            //
            // Writing power_on would not have worked: evaluate() derives power
            // from the room and never reads that column back, so an adopted
            // value was overwritten a second later. Somewhere for a human's
            // choice to outrank the loop is the missing concept, not somewhere
            // to record what the hardware happens to be doing.
            //
            // No expiry. Switching a unit off by hand and having it come back
            // an hour later is the behaviour this removes, so a timeout would
            // only make it slower to arrive. It is cleared by using the app,
            // which is the same gesture that says you want automatic control
            // back.
            $table->boolean('manual_power')->nullable();
            $table->timestamp('manual_since')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn(['manual_power', 'manual_since']);
        });
    }
};

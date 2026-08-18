<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // Both override the fan speed field in the Gree protocol: with
            // either set, the unit picks its own speed and silently ignores
            // ours. Until now we never wrote them, so whatever the handset last
            // left set persisted forever and made the fan control look broken.
            //
            // They are mutually exclusive at the unit, and enforced as such in
            // AirConditionerController::update.
            $table->boolean('quiet')->default(false);
            $table->boolean('turbo')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn(['quiet', 'turbo']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // Everything the unit says about itself, not just its power.
            // update_state() already pulls the whole set off the Gree, and
            // keeping one field of it threw away the only description of the
            // hardware this system has.
            //
            // One JSON column rather than nine mirrored ones: this is a
            // snapshot read as a whole and never queried by field, and its
            // shape belongs to the unit rather than to us.
            $table->json('observed_state')->nullable();

            // When a settable field was last changed by a person. What makes
            // "asked for, not applied yet" tellable from "asked for a while
            // ago and it never took" -- the first is normal, the second is a
            // fault, and without a timestamp they look identical.
            $table->timestamp('settings_changed_at')->nullable();
        });

        Schema::table('air_conditioners', function (Blueprint $table) {
            // Superseded by observed_state['power'], and added on this same
            // branch, so there is no released data to preserve.
            $table->dropColumn('observed_power_on');
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->boolean('observed_power_on')->nullable();
        });

        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn(['observed_state', 'settings_changed_at']);
        });
    }
};

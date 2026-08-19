<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // When a person last asked this unit for something, from here.
            //
            // The Pi commands when this moves and at no other time. Until now
            // it commanded whenever the unit disagreed with the document, which
            // meant every reading was a potential instruction: set Quiet on the
            // handset, and the next document to arrive found a disagreement and
            // pushed our whole state back over it.
            //
            // A disagreement is now something to adopt, never something to
            // correct, so the only thing that can make us speak is somebody
            // asking us to.
            $table->timestamp('commanded_at')->nullable();

            // Settings whose last command the unit did not take.
            //
            // Nothing retries any more, so a rejected change reverts to what
            // the unit actually has -- correct, and silent, and indistinguishable
            // from never having pressed the button. This is what lets the
            // control say so. Cleared the next time that setting is commanded.
            $table->json('rejected_settings')->nullable();
        });

        // settings_changed_at answered a question that no longer exists -- how
        // long a disagreement had been outstanding, so it could be called a
        // fault. Nothing is a fault now; the unit is simply right.
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn('settings_changed_at');
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->timestamp('settings_changed_at')->nullable();
        });

        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->dropColumn(['commanded_at', 'rejected_settings']);
        });
    }
};

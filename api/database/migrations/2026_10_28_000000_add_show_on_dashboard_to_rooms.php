<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            // What the dashboard shows, not what the house does: a hidden room
            // is still heated, cooled and boosted exactly as before.
            $table->boolean('show_on_dashboard')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('show_on_dashboard');
        });
    }
};

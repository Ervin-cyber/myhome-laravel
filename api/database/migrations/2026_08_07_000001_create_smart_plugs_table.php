<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('smart_plugs', function (Blueprint $table) {
            $table->id();

            // MAC, not IP: a plug moves between DHCP leases like everything
            // else on this network, and its identity has to survive that.
            $table->string('mac')->unique();
            $table->string('name');
            $table->string('ip')->nullable();

            // Null means the plug measures the house rather than one room —
            // which is the case whenever a single plug feeds several rooms.
            $table->foreignId('room_id')->nullable()->constrained()->nullOnDelete();

            $table->boolean('online')->default(true);
            $table->timestamp('last_seen_at')->nullable();

            // The plug keeps its own history and its own daily total, so there
            // is no reading table here: only the latest values, which are what
            // the dashboard shows and what the fault check reads. Keeps a
            // permanent write stream off the Pi's card.
            $table->float('watts')->nullable();
            $table->timestamp('watts_at')->nullable();
            $table->float('energy_today')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('smart_plugs');
    }
};

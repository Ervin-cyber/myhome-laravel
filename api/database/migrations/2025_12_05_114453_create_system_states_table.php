<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('system_states', function (Blueprint $table) {
            $table->id();
            $table->float('target_temp')->default(19);
            $table->integer('heating_until')->default(0);
            $table->smallInteger('heating_on')->default(0);
            $table->timestamp('timestamp')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            //$table->dropTimestamps(); //remove created_at, updated_at
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_states');
    }
};

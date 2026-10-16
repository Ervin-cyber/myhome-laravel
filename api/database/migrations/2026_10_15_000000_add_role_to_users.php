<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Two roles and no permission table. A household has an owner and
            // everybody else; a per-feature grant would be a matrix nobody fills in.
            $table->string('role')->default('member')->after('email');
        });

        // Everybody who exists today could already do everything, the Pi's own
        // account among them. Promoting them all keeps the deploy a no-op; who
        // should be a member is then a decision made on the users page.
        DB::table('users')->update(['role' => 'admin']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};

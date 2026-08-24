<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            // A Gree does not store Fahrenheit. It stores an integer Celsius in
            // SetTem and a half-degree flag in TemRec, and both units here were
            // asked whether they would hold that flag while set to Celsius --
            // they do. So 26.5 is reachable without putting the wall display
            // into Fahrenheit, which was the only other route to it.
            //
            // An integer column would have truncated every half back to a whole
            // one on the way through, silently.
            $table->float('target_temp')->default(24)->change();
        });
    }

    public function down(): void
    {
        Schema::table('air_conditioners', function (Blueprint $table) {
            $table->integer('target_temp')->default(24)->change();
        });
    }
};

<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Air conditioner placement
    |--------------------------------------------------------------------------
    |
    | Which room each Gree unit physically hangs in, keyed by MAC. A unit is
    | bolted to a wall, so this is a fact about the house rather than something
    | worth choosing in the UI on every install.
    |
    | Applied on discovery to any unit that has no room yet, so a freshly
    | migrated or re-flashed database lands correctly without hand-assignment.
    | An assignment made in the dashboard is never overwritten.
    |
    | Keys are normalised (lower-cased, separators stripped), so "58:0D:0D:3B:00:96"
    | and "580d0d3b0096" are the same unit.
    |
    */

    'ac_rooms' => [
        '580d0d3b0096' => 'bedroom',
        '580d0d3b00bd' => 'living',
    ],

    /*
    |--------------------------------------------------------------------------
    | Smart plug placement
    |--------------------------------------------------------------------------
    |
    | Which room each metering plug measures, keyed by MAC, in the same form as
    | ac_rooms above.
    |
    | Leave a plug out to keep it house-wide. A plug that feeds more than one
    | room has to stay house-wide: its reading is a total, and attributing that
    | total to one of the rooms it covers would simply be wrong.
    |
    */

    'plug_rooms' => [
        // 'aabbccddeeff' => 'bedroom',
    ],

];

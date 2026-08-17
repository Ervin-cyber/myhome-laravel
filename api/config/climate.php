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

];

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

    /*
    |--------------------------------------------------------------------------
    | Which plugs are climate plugs
    |--------------------------------------------------------------------------
    |
    | A TP-Link account reaches every plug on it, and most of them have nothing
    | to do with the house climate — a desk, a PC, a lamp. Those report far more
    | movement than an air conditioner does, so left unfiltered they are the
    | loudest thing on the dashboard while being the least relevant.
    |
    | List the MACs that meter something climate-related. Anything not named
    | here is ignored on sync and never shown, so it costs nothing to have on
    | the account. Same normalisation as the maps above, so colons are fine.
    |
    | Set in api/.env, comma separated:
    |
    |     CLIMATE_PLUG_MACS="AC-A7-F1-88-41-40"
    |     CLIMATE_PLUG_MACS="ACA7F1884140,001122334455"
    |
    | Leave it unset to accept every plug that answers, which is what a fresh
    | install wants while you work out which MAC is which.
    |
    */

    /*
    |--------------------------------------------------------------------------
    | How far past its setpoint a room goes before its unit is cut
    |--------------------------------------------------------------------------
    |
    | In °C. A room asking to be cooled to 24 and sitting at 21 has nothing left
    | for its unit to do, so we stop handing it the room.
    |
    | Set to "off" to stop deciding this at all. The unit then keeps power for
    | as long as its room is on, and its own inverter does the regulating from
    | the setpoint and mode we give it -- which is what it is for, and better at
    | than we are from outside. Worth choosing when a room sensor sits in the
    | unit's own airflow: it reads the discharge rather than the room, and cuts
    | the unit on a temperature nobody in the room is feeling.
    |
    |     CLIMATE_IDLE_MARGIN=off      # never cut on temperature
    |     CLIMATE_IDLE_MARGIN=3        # more slack before cutting
    |
    | Rooms that read their temperature from the unit are exempt either way:
    | they go blind the moment it stops, so they are never cut on temperature.
    |
    */

    'idle_margin' => in_array(strtolower((string) env('CLIMATE_IDLE_MARGIN', '')), ['off', 'false', 'none'], true)
        ? null
        : (float) (env('CLIMATE_IDLE_MARGIN') ?: 2.0),

    'plug_macs' => array_values(array_filter(array_map(
        fn ($mac) => strtolower(preg_replace('/[^0-9a-fA-F]/', '', trim($mac))),
        explode(',', (string) env('CLIMATE_PLUG_MACS', ''))
    ))),

];

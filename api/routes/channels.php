<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('live-updates', function ($user) {
    // Since this is likely a public widget, you can authorize any authenticated user,
    // or simply return true if you don't require any user authentication check.
    // NOTE: If you need to check if a user is logged in: return $user != null;
    return true; 
});

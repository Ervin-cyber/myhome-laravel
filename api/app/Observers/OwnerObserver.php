<?php

namespace App\Observers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class OwnerObserver
{
    public function creating(Model $model): void
    {
        $model->created_by = Auth::id();
    }

    public function updating(Model $model): void
    {
        $model->updated_by = Auth::id();
    }
}

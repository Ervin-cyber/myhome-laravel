<?php

namespace App\Models;

use App\Observers\OwnerObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasEvents;
use Illuminate\Database\Eloquent\Model;

#[ObservedBy(OwnerObserver::class)]
class Invite extends Model
{
    use HasEvents;

    protected $keyType = 'integer';

    protected $fillable = ['code', 'used', 'used_at', 'expires_at', 'created_at', 'updated_at', 'created_by', 'updated_by'];
}

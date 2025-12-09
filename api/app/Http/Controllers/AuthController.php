<?php

namespace App\Http\Controllers;

use App\Http\Requests\UserRequest;
use App\Models\Invite;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(UserRequest $req)
    {
        $user = User::where('email', $req->email)->first();

        if (!$user || !Hash::check($req->password, $user->password)) {
            throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
        }

        $token = $user->createToken('api-token')->plainTextToken;

        return response()->json([
            'access_token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    public function me(Request $req)
    {
        return response()->json(auth()->user());
    }

    /*
    public function register(Request $req)
    {
        if (env('INVITE_REQUIRED', true) && env('ALLOW_REGISTRATION', false)) {
            $req->validate(['invite' => 'required|string']);
            $invite = Invite::where('code', $req->invite)->first();
            if (!$invite || $invite->used || ($invite->expires_at && now()->greaterThan($invite->expires_at))) {
                return response()->json(['message' => 'Invalid invite code'], 403);
            }
        } elseif (!filter_var(env('ALLOW_REGISTRATION', false), FILTER_VALIDATE_BOOLEAN)) {
            return response()->json(['message' => 'Registration disabled'], 403);
        }

        $req->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $req->name,
            'email' => $req->email,
            'password' => Hash::make($req->password),
        ]);

        if (isset($invite) && $invite) {
            $invite->used = true;
            $invite->used_at = now();
            $invite->save();
        }

        auth()->login($user);
        $token = $user->createToken('default');
        return response()->json(['user' => $user, 'token' => $token->plainTextToken]);
    }
        */
}

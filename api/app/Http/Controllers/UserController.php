<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The household's accounts. Admin only, by the route group.
 *
 * Two guards matter more than the rest. Nobody may delete their own account
 * from here, and the last admin may not be demoted or deleted -- either one
 * leaves a house that nobody can change the season of, with no way back in
 * short of the database.
 */
class UserController extends Controller
{
    public function index()
    {
        // tokens_count, because the Pi signs in with an ordinary account. One
        // with a token nobody remembers creating is the Pi's, and deleting it
        // stops the house.
        return response()->json(
            User::withCount('tokens')->orderBy('name')->get()
        );
    }

    public function store(StoreUserRequest $request)
    {
        $data = $request->validated();

        $user = new User([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
        ]);
        $user->role = $data['role'];
        $user->save();

        return response()->json($user->loadCount('tokens'), 201);
    }

    public function update(UpdateUserRequest $request, $id)
    {
        $data = $request->validated();

        return DB::transaction(function () use ($data, $request, $id) {
            $user = User::lockForUpdate()->findOrFail($id);

            if (isset($data['role']) && $data['role'] !== User::ROLE_ADMIN && $user->isAdmin()) {
                if ($user->is($request->user())) {
                    throw ValidationException::withMessages(['role' => ['You cannot remove your own admin role.']]);
                }

                $this->assertAnotherAdminRemains($user);
            }

            $user->fill(array_filter(
                [
                    'name' => $data['name'] ?? null,
                    'email' => $data['email'] ?? null,
                    'password' => $data['password'] ?? null,
                ],
                fn ($value) => $value !== null && $value !== '',
            ));

            if (isset($data['role'])) {
                $user->role = $data['role'];
            }

            $user->save();

            return response()->json($user->loadCount('tokens'));
        });
    }

    public function destroy(Request $request, $id)
    {
        return DB::transaction(function () use ($request, $id) {
            $user = User::lockForUpdate()->findOrFail($id);

            if ($user->is($request->user())) {
                throw ValidationException::withMessages(['user' => ['You cannot delete your own account.']]);
            }

            if ($user->isAdmin()) {
                $this->assertAnotherAdminRemains($user);
            }

            // Sanctum's tokens hang off a morph, not a foreign key, so nothing
            // cascades. Left behind, they would keep working for a deleted user.
            $user->tokens()->delete();
            $user->delete();

            return response()->json(['message' => 'Deleted']);
        });
    }

    /**
     * Locks the other admins too, so two admins demoting each other at the
     * same moment cannot both see the other as the one who remains.
     */
    private function assertAnotherAdminRemains(User $user): void
    {
        $others = User::where('role', User::ROLE_ADMIN)
            ->whereKeyNot($user->getKey())
            ->lockForUpdate()
            ->count();

        if ($others === 0) {
            throw ValidationException::withMessages(['role' => ['The house needs at least one admin.']]);
        }
    }
}

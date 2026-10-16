<?php

namespace Tests\Feature;

use App\Models\SystemState;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserAdminTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::factory()->create();
        $user->role = User::ROLE_ADMIN;
        $user->save();

        return $user;
    }

    public function test_a_new_account_is_a_member(): void
    {
        $this->assertSame(User::ROLE_MEMBER, User::factory()->create()->fresh()->role);
    }

    public function test_a_member_cannot_reach_the_users_page(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/admin/users')->assertForbidden();
        $this->postJson('/api/admin/users', [
            'name' => 'Sneaky', 'email' => 'sneaky@example.test', 'password' => 'password123', 'role' => 'admin',
        ])->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'sneaky@example.test']);
    }

    public function test_an_admin_adds_a_member(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/admin/users', [
            'name' => 'Guest', 'email' => 'guest@example.test', 'password' => 'password123', 'role' => 'member',
        ])->assertCreated()->assertJsonPath('role', 'member')->assertJsonMissingPath('password');

        $this->assertSame(User::ROLE_MEMBER, User::where('email', 'guest@example.test')->value('role'));
    }

    public function test_a_blank_password_on_update_leaves_the_password_alone(): void
    {
        Sanctum::actingAs($this->admin());
        $member = User::factory()->create();
        $hash = $member->password;

        $this->postJson("/api/admin/users/{$member->id}", ['name' => 'Renamed', 'password' => ''])->assertOk();

        $this->assertSame('Renamed', $member->fresh()->name);
        $this->assertSame($hash, $member->fresh()->password);
    }

    public function test_an_admin_cannot_demote_themselves(): void
    {
        $admin = $this->admin();
        $this->admin();
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/users/{$admin->id}", ['role' => 'member'])->assertUnprocessable();

        $this->assertTrue($admin->fresh()->isAdmin());
    }

    public function test_an_admin_may_delete_another_admin(): void
    {
        // The caller remains, so the house still has an admin afterwards. The
        // last-admin guard only bites when two admins act on each other at the
        // same moment, which is what its row locks are for.
        $admin = $this->admin();
        $other = $this->admin();
        Sanctum::actingAs($admin);

        $this->deleteJson("/api/admin/users/{$other->id}")->assertOk();
        $this->assertModelMissing($other);
    }

    public function test_another_admin_may_be_demoted_while_one_remains(): void
    {
        $admin = $this->admin();
        $other = $this->admin();
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/users/{$other->id}", ['role' => 'member'])->assertOk();

        $this->assertFalse($other->fresh()->isAdmin());
    }

    public function test_an_admin_cannot_delete_their_own_account(): void
    {
        $admin = $this->admin();
        $this->admin();
        Sanctum::actingAs($admin);

        $this->deleteJson("/api/admin/users/{$admin->id}")->assertUnprocessable();
        $this->assertModelExists($admin);
    }

    public function test_deleting_an_account_revokes_its_tokens(): void
    {
        Sanctum::actingAs($this->admin());
        $member = User::factory()->create();
        $member->createToken('api-token');

        $this->deleteJson("/api/admin/users/{$member->id}")->assertOk();

        $this->assertModelMissing($member);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $member->id]);
    }

    public function test_a_member_cannot_change_the_season(): void
    {
        SystemState::firstOrCreate()->update(['mode' => 'heating']);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/state', ['mode' => 'cooling'])->assertForbidden();

        $this->assertSame('heating', SystemState::first()->mode);
    }

    public function test_a_member_may_switch_the_house_while_sending_the_current_season(): void
    {
        SystemState::firstOrCreate()->update(['mode' => 'heating', 'enabled' => true]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/state', ['mode' => 'heating', 'enabled' => false])->assertOk();

        $this->assertFalse(SystemState::first()->enabled);
    }

    public function test_an_admin_hides_the_air_conditioners(): void
    {
        SystemState::firstOrCreate();
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/state', ['show_air_conditioners' => false])->assertOk();

        $this->assertFalse(SystemState::first()->show_air_conditioners);
        $this->getJson('/api/state')->assertJsonPath('show_air_conditioners', false);
    }

    public function test_power_usage_is_hidden_independently_of_the_units(): void
    {
        SystemState::firstOrCreate();
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/state', ['show_air_conditioners' => false])->assertOk();

        $this->getJson('/api/state')
            ->assertJsonPath('show_air_conditioners', false)
            ->assertJsonPath('show_power_usage', true);

        $this->postJson('/api/state', ['show_power_usage' => false])->assertOk();

        $this->assertFalse(SystemState::first()->show_power_usage);
    }

    public function test_a_member_cannot_hide_the_air_conditioners(): void
    {
        SystemState::firstOrCreate();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/state', ['show_air_conditioners' => false])->assertForbidden();

        $this->assertTrue(SystemState::first()->show_air_conditioners);
    }

    public function test_an_admin_changes_the_season(): void
    {
        SystemState::firstOrCreate()->update(['mode' => 'heating']);
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/state', ['mode' => 'cooling'])->assertOk();

        $this->assertSame('cooling', SystemState::first()->mode);
    }
}

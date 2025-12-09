<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {

        $adminEmail = env('ADMIN_EMAIL');
        $passwordHash = env('ADMIN_PASSWORD_HASH');

        if (!$adminEmail || !$passwordHash) {
            $this->command->warn('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set in .env. Skipping Admin User creation.');
            return;
        }

        // Check if the admin user already exists
        if (User::where('email', $adminEmail)->exists()) {
            $this->command->info('Admin user already exists. Skipping.');
            return;
        }

        // Create the admin user using the hashed password from .env
        User::create([
            'name' => 'System Administrator',
            'email' => $adminEmail,
            'password' => $passwordHash,
            'email_verified_at' => now(),
        ]);

        $this->command->info('Admin User created successfully: ' . $adminEmail);

        // 1. Get a model to associate the tokens with (e.g., the new Admin User)
        $adminUser = User::where('email', env('ADMIN_EMAIL'))->first();

        $devices = [
            'Raspberry Pi 4' => [
                'token_key' => env('PI_API_TOKEN'),
                // Define specific permissions for the Pi
                //'abilities' => ['status:read', 'data:write'], 
            ],
            'ESP8266' => [
                'token_key' => env('ESP_API_TOKEN'),
                // Define very limited permissions for the smaller device
                //'abilities' => ['data:write'], 
            ],
        ];

        foreach ($devices as $deviceName => $data) {
            $tokenKey = $data['token_key'];

            if (!$tokenKey) {
                $this->command->warn("Token for {$deviceName} not set in .env. Skipping.");
                continue;
            }

            // The token is structured as ID|Secret, we need to extract the ID part
            $idPart = Str::before($tokenKey, '|');
            $secretPart = Str::after($tokenKey, '|');

            // Check if the token already exists
            if (PersonalAccessToken::where('id', $idPart)->exists()) {
                $this->command->info("Token for {$deviceName} already exists. Skipping.");
                continue;
            }

            $newToken = new PersonalAccessToken();
            // Create the token entry manually to use the pre-defined secret
            $newToken->forceFill([
                'id' => $idPart, // Use the ID part from the .env token
                'tokenable_type' => 'App\Models\User',
                'tokenable_id' => 1,
                'name' => $deviceName . ' Access Token',
                'token' => hash('sha256', $secretPart), // Sanctum requires the SHA256 hash of the secret
                'abilities' => ["*"],
            ])->save();

            $this->command->info("Token created for {$deviceName} with ID: {$idPart}");
        }
    }
}

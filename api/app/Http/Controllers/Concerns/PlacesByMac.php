<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Room;

trait PlacesByMac
{
    /**
     * Room a device belongs to according to config/climate.php, or null if the
     * MAC is not one we know about.
     *
     * Hardware is screwed to a wall or plugged into a socket, so where it lives
     * is configuration rather than something worth choosing in the UI on every
     * install. Both sides of the lookup are normalised, since devices report
     * their MAC unseparated and lower-cased but a hand-typed config entry may
     * well have colons in it.
     */
    protected function configuredRoomId(string $mac, string $configKey): ?int
    {
        $slug = collect(config($configKey, []))
            ->mapWithKeys(fn ($roomSlug, $key) => [$this->normaliseMac((string) $key) => $roomSlug])
            ->get($this->normaliseMac($mac));

        return $slug ? Room::where('slug', $slug)->value('id') : null;
    }

    protected function normaliseMac(string $mac): string
    {
        return strtolower(preg_replace('/[^0-9a-fA-F]/', '', $mac));
    }
}

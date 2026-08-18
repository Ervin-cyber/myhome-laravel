# Home Climate Control System 

## 📸 Screenshots

<img width="248" height="508" alt="image" src="https://github.com/user-attachments/assets/d9c376da-241f-466f-a674-027ea76d6ae2" />
<img width="248" height="508" alt="image" src="https://github.com/user-attachments/assets/c821d56c-4b8e-41fe-bc27-fcbc724abf8f" />
<img width="248" height="508" alt="image" src="https://github.com/user-attachments/assets/f8a33184-3a05-4683-aecd-a9c07936478a" />

## 🌟 Application Features

This is a focused, real-time home climate management dashboard that provides secure access and immediate feedback on environmental conditions and heating controls.

* **Secure Dashboard:** Login protected via **Laravel Sanctum** token authentication.
* **Live Temperature Monitoring:** Real-time display of current temperature data using **Laravel Reverb** (WebSockets) and **Laravel Echo**.
* **Target Temperature Control:**
    * **Quick Set:** One-click presets for common target temperatures (e.g., 20°C, 22°C).
    * **Custom Set:** Ability to set and persist any desired thermostat temperature.
* **Boost Functionality:** Quick, temporary heating override for fixed periods (15 or 30 minutes).
* **Daily Statistics:** Display of key environmental and usage metrics:
    * Minimum, Maximum, and Average Temperature.
    * Total runtime of the heating system in the last 24 hours.
    * Heating system cycle counter (how many times it was turned on).

## 🔌 Energy metering (Tapo P110)

The Pi reads current draw and today's total from a Tapo plug via
[python-kasa](https://github.com/python-kasa/python-kasa), using a TP-Link
account for the local handshake. Both credentials live in the Pi's `.env` and
never reach the API or the browser:

```
TAPO_EMAIL=you@example.com
TAPO_PASSWORD=...
TAPO_HOSTS=192.168.1.8    # optional; skips broadcast discovery
```

Metering is entirely optional — without `python-kasa` installed, or without
those variables, the plug thread never starts and climate control is unaffected.

### Say which plugs are climate plugs

A TP-Link account reaches every plug on it, and most of them meter something
that has nothing to do with the house climate — a desk, a PC, a lamp. Those move
far more than an air conditioner does, so left unfiltered the least relevant plug
is the loudest thing on the dashboard.

Name the ones that matter in `api/.env`, comma separated:

```
CLIMATE_PLUG_MACS="aa-bb-cc-dd-ee-ff,001122334455"
```

Anything not listed is dropped on sync and never shown, so it costs nothing to
leave on the account. Unset means "accept every plug", which is what you want on
a fresh install while working out which MAC is which. Colons, dashes and case are
all fine — the value is normalised before comparison.

Run `php artisan config:clear` after changing it.

### Keep the account small

These are TP-Link *cloud* credentials, and local access requires the account
that **owns** the device, so whatever is in this file can sign in and reach
every device on that account — camera feeds included.

Provision the plug with a dedicated account that owns nothing else, then share
it back to your everyday account so the app still works. Whoever reads this file
then learns how much electricity the air conditioners use, and nothing more.

Worth doing regardless: `chmod 600 .env`. It is git-ignored, it is not inside
the nginx document root, and Laravel reads a different file in `api/`, so the
filesystem is the exposure that remains.

Run `python3 check_tapo.py [ip]` on the Pi to diagnose; it reports each stage
separately. A working P110 looks like this:

```
model   : 'P110'
modules : ['AutoOff', 'Cloud', 'DeviceModule', 'Energy', ...]
energy.current_consumption = 2.309      # watts, now
energy.consumption_today   = 0.027      # kWh so far today
```

Note the draw: a couple of watts is both air conditioners sitting idle. A
running compressor is several hundred, which is what makes the reading usable
as a check that a command actually reached the hardware.

### Two failures worth telling apart

**`UnsupportedDeviceError ... encrypt_type='TPAP'`** — the device announced a
scheme python-kasa does not implement. Nothing about credentials or addressing
gets past this. The Pi records the address and stops dialling it until the
service restarts, so it costs only the reading. The `tapo` library implements
TPAP and is the fallback worth trying; `check_tapo_alt.py` probes it.

A plug has been observed announcing TPAP on one occasion and KLAP on another,
so re-adding it in the Tapo app is worth trying before concluding anything.

**`AuthenticationError` / `HASH_MISMATCH`** — the handshake completed and the
device rejected the challenge hash. This is credentials, and it is worth
confirming with a second library before touching the hardware: if both
python-kasa and `tapo` say the same thing, the fault is not in either.

**The credentials must belong to the account that owns the device.** This is by
far the most likely cause, and the one that survives every amount of retyping.
Local
access works by the device holding a hash derived from the email and password it
was provisioned with. An account the device has merely been *shared* with
controls it perfectly well in the app — that goes through the cloud — but can
never satisfy the local challenge, because the device holds no hash for it. The
failure is identical to a wrong password, and no amount of retyping fixes it.
Either use the owner's account, or factory reset the plug and add it with the
account you intend to use, which makes that account the owner.

Other causes, cheapest first: whitespace or case in `.env` (both scripts print
the loaded length and flag stray spaces); the account password having changed
since the plug was added; or the plug holding credentials propagated by TP-Link
Simple Setup from another device on the network. The last needs a factory reset
with other TP-Link devices powered off.

## 🚀 Technical Architecture

This project is built on a high-performance, containerized, and decoupled architecture.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | **Next.js** | Handles the user dashboard, provides optimal performance, and consumes the Laravel API. |
| **Backend API** | **Laravel** | Manages all business logic, data persistence (statistics), and secure API endpoints. |
| **Real-Time** | **Laravel Reverb** & **Echo** | Provides low-latency WebSockets for instant temperature and state updates to the dashboard. |
| **Deployment** | **Docker** & **Nginx** | Ensures consistent development and production environments, with Nginx acting as a reverse proxy for all services. |

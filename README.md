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

Run `python3 check_tapo.py [ip]` on the Pi to diagnose; it reports each stage
separately.

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

Causes, cheapest first: whitespace or case in `.env` (both scripts print the
loaded length and flag stray spaces); the account password having changed since
the plug was added; or the plug holding credentials propagated by TP-Link Simple
Setup from another device on the network rather than the ones for your account.
The last needs a factory reset with other TP-Link devices powered off.

## 🚀 Technical Architecture

This project is built on a high-performance, containerized, and decoupled architecture.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | **Next.js** | Handles the user dashboard, provides optimal performance, and consumes the Laravel API. |
| **Backend API** | **Laravel** | Manages all business logic, data persistence (statistics), and secure API endpoints. |
| **Real-Time** | **Laravel Reverb** & **Echo** | Provides low-latency WebSockets for instant temperature and state updates to the dashboard. |
| **Deployment** | **Docker** & **Nginx** | Ensures consistent development and production environments, with Nginx acting as a reverse proxy for all services. |

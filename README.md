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

### Known blocker: TPAP firmware

Some P110 firmware speaks an encryption scheme python-kasa does not implement:

```
UnsupportedDeviceError: Unsupported device ... of type SMART.TAPOPLUG
with encrypt_scheme EncryptionScheme(..., encrypt_type='TPAP', ...)
```

This is an upstream gap, not a configuration problem — no credentials, address
or network change gets past it, and 0.10.2 is the newest release as of writing.
The Pi records such an address and stops dialling it until the service is
restarted, so it costs nothing but the reading. Retry after upgrading
python-kasa; if `grep -ril tpap` in the installed package finds nothing, support
has not landed yet.

## 🚀 Technical Architecture

This project is built on a high-performance, containerized, and decoupled architecture.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | **Next.js** | Handles the user dashboard, provides optimal performance, and consumes the Laravel API. |
| **Backend API** | **Laravel** | Manages all business logic, data persistence (statistics), and secure API endpoints. |
| **Real-Time** | **Laravel Reverb** & **Echo** | Provides low-latency WebSockets for instant temperature and state updates to the dashboard. |
| **Deployment** | **Docker** & **Nginx** | Ensures consistent development and production environments, with Nginx acting as a reverse proxy for all services. |

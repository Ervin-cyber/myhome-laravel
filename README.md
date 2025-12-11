# Home Climate Control System

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

## 🚀 Technical Architecture

This project is built on a high-performance, containerized, and decoupled architecture.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | **Next.js** | Handles the user dashboard, provides optimal performance, and consumes the Laravel API. |
| **Backend API** | **Laravel** | Manages all business logic, data persistence (statistics), and secure API endpoints. |
| **Real-Time** | **Laravel Reverb** & **Echo** | Provides low-latency WebSockets for instant temperature and state updates to the dashboard. |
| **Deployment** | **Docker** & **Nginx** | Ensures consistent development and production environments, with Nginx acting as a reverse proxy for all services. |
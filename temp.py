#!/usr/bin/env python
import time
import signal
import sys
import RPi.GPIO as GPIO
import requests
import json
import websocket
import os
import threading
from greeclimate.discovery import Discovery
from greeclimate.device import Device, Mode
import greeclimate.device as gree_device
import asyncio
from dotenv import load_dotenv

def _enum_member(enum_name, *candidates):
    """
    Look a member up by any of several spellings.

    greeclimate has renamed these enums between releases, and this script runs
    on whatever is installed on the Pi. An unknown name degrades to None, which
    means "leave that setting alone", rather than crashing the control loop.
    """
    enum_cls = getattr(gree_device, enum_name, None)
    if enum_cls is None:
        return None

    for candidate in candidates:
        member = getattr(enum_cls, candidate, None)
        if member is not None:
            return member

    return None

FAN_SPEEDS = {
    'auto': _enum_member('FanSpeed', 'Auto'),
    'low': _enum_member('FanSpeed', 'Low'),
    'medium_low': _enum_member('FanSpeed', 'MediumLow'),
    'medium': _enum_member('FanSpeed', 'Medium'),
    'medium_high': _enum_member('FanSpeed', 'MediumHigh'),
    'high': _enum_member('FanSpeed', 'High'),
}

VERTICAL_SWING = {
    'off': _enum_member('VerticalSwing', 'Default', 'Off'),
    'full': _enum_member('VerticalSwing', 'FullSwing', 'Full'),
    'fixed_upper': _enum_member('VerticalSwing', 'FixedUpper', 'Upper'),
    'fixed_middle_up': _enum_member('VerticalSwing', 'FixedUpperMiddle', 'FixedMiddleUp'),
    'fixed_middle': _enum_member('VerticalSwing', 'FixedMiddle', 'Middle'),
    'fixed_middle_low': _enum_member('VerticalSwing', 'FixedLowerMiddle', 'FixedMiddleLow'),
    'fixed_lower': _enum_member('VerticalSwing', 'FixedLower', 'Lower'),
}

HORIZONTAL_SWING = {
    'off': _enum_member('HorizontalSwing', 'Default', 'Off'),
    'full': _enum_member('HorizontalSwing', 'FullSwing', 'Full'),
    'fixed_left': _enum_member('HorizontalSwing', 'Left'),
    'fixed_middle_left': _enum_member('HorizontalSwing', 'LeftCenter', 'MiddleLeft'),
    'fixed_middle': _enum_member('HorizontalSwing', 'Center', 'Middle'),
    'fixed_middle_right': _enum_member('HorizontalSwing', 'RightCenter', 'MiddleRight'),
    'fixed_right': _enum_member('HorizontalSwing', 'Right'),
}

MODES = {
    'cool': _enum_member('Mode', 'Cool'),
    'heat': _enum_member('Mode', 'Heat'),
    'dry': _enum_member('Mode', 'Dry'),
    'fan': _enum_member('Mode', 'Fan'),
    'auto': _enum_member('Mode', 'Auto'),
}


# Device properties send_gree_command writes to. Set through apply_setting,
# which skips anything this greeclimate build does not have.
DEVICE_SETTINGS = ('mode', 'fan_speed', 'vertical_swing', 'horizontal_swing', 'xfan')

def report_unmapped_settings():
    """
    Name every setting this greeclimate build cannot express.

    Both an unresolved enum member and a missing device property are applied as
    "leave that setting alone", which is the right thing to do to a compressor
    but is otherwise invisible: the dashboard would offer a control that quietly
    does nothing. Saying so once at startup makes it findable in the logs.
    """
    unmapped = [
        f'{group}.{key}'
        for group, mapping in (
            ('mode', MODES),
            ('fan_speed', FAN_SPEEDS),
            ('swing_v', VERTICAL_SWING),
            ('swing_h', HORIZONTAL_SWING),
        )
        for key, member in mapping.items()
        if member is None
    ]

    unmapped += [
        f'Device.{attribute}'
        for attribute in DEVICE_SETTINGS
        if not hasattr(Device, attribute)
    ]

    if not unmapped:
        return

    message = 'greeclimate has no member for: ' + ', '.join(unmapped)
    print(f"WARNING: {message}. Those controls will do nothing.")
    send_ntfy_alert(message, "warning", key="unmapped_settings")

# Global variable to store found and paired AC units
GREE_DEVICES = {}
gree_lock = None # Initialized on the AC event loop
last_gree_scan = 0
ws_app = None

# All Gree I/O runs on one long-lived event loop in a background thread.
# The bound Device objects own transports tied to the loop that created them,
# so a fresh asyncio.run() per command would talk to a closed loop.
ac_loop = None
ac_loop_thread = None

# Last state actually pushed to each unit, keyed by MAC: (desired, sent_at).
# Used to skip redundant LAN commands — the broadcast fires on every sensor
# reading, but a unit only needs a command when what we want from it changes.
last_sent_ac_state = {}
AC_RESEND_INTERVAL = 600  # re-assert state at least every 10 min, in case of remote-control changes

# While a dashboard is open the API asks us to interrogate the units directly,
# so the page shows what they actually report rather than what we last told
# them. The window is carried in the control document and expires on its own.
LIVE_POLL_INTERVAL = 15

# The API decides, this script only applies. If no control document arrives
# within the deadline the hardware is failed safe, so a dead API or a dropped
# websocket can never leave the boiler running unattended.
last_control_at = 0
last_control = None
CONTROL_TIMEOUT = 300
WATCHDOG_INTERVAL = 30
failsafe_tripped = False
boiler_on = False

load_dotenv()     

# Setup GPIO
GPIO.cleanup()
HEATING_RELAY_PIN = 24
GPIO.setmode(GPIO.BCM)
GPIO.setup(HEATING_RELAY_PIN, GPIO.OUT)

REVERB_HOST = os.getenv('REVERB_HOST')
APP_KEY = os.getenv('APP_KEY')
CHANNEL_NAME = os.getenv('CHANNEL_NAME')
EVENT_NAME = os.getenv('EVENT_NAME')

# AC units are no longer configured here: they are discovered on the LAN and
# stored in the air_conditioners table, then delivered in the broadcast payload.

NTFY_TOPIC = os.getenv('NTFY_TOPIC')
NOTIFY_COOLDOWN = 3600 # 1 hour
last_notifications = {}

def handle_exit(sig, frame):
    print("Stopping service — turning relay OFF")
    set_heating_relay(False)
    try:
        turn_off_all_acs()
    except Exception as e:
        # Never let an AC failure prevent the GPIO relay from being released.
        print(f"Error turning off AC units during shutdown: {e}")
    GPIO.cleanup()
    sys.exit(0)

def graceful_shutdown(sig, frame):
    """This function is called by the system when you press Ctrl+C"""
    print("\n\n[!] Manual shutdown (Ctrl+C) detected!")
    print("Safe system shutdown in progress...")
    
    try:
        if ws_app:
            print(" - Closing WebSocket connection...")
            ws_app.close()
    except Exception as e:
        print(f"Error closing WS: {e}")
        
    try:
        # SAFETY: Release all GPIO relays!
        handle_exit(None, None)
    except Exception as e:
        print(f"Error during GPIO cleanup: {e}")
        
    print("Exiting. Have a nice day!")
    os._exit(0)

signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)

# Last state reported back to the API, so we only report on a change.
# Hysteresis and setpoints now live in the API's ClimateService, not here.
heating_on = False
cooling_on = False

API_ENDPOINT = os.getenv('API_ENDPOINT')
Headers = { "Authorization" : os.getenv('API_TOKEN') }
previous_control_data = {}

def send_ntfy_alert(message, tag, key=None):
    current_time = time.time()
    
    # Anti-spam logic
    if key:
        if key in last_notifications and (current_time - last_notifications[key]) < NOTIFY_COOLDOWN:
            return
        last_notifications[key] = current_time

    try:
        requests.post(f"https://ntfy.sh/{NTFY_TOPIC}", 
                      data=message.encode(encoding='utf-8'),
                      headers={"Title": "Lavandei", "Priority": "high", "Tags": f"{tag}"})
    except Exception as e: 
        print(f"Failed: {e}")

def send_state(data):
    try:
        response = requests.post(url=f'{API_ENDPOINT}/state', headers=Headers, json=data, timeout=5)
        if not response.ok:
            print(f"Warning: send_state returned {response.status_code}: {response.text}")
    except requests.RequestException as exc:
        print(f"Warning: failed to send state update: {exc}")
        send_ntfy_alert(f"Failed to send state update: {exc}", "warning", key="state_update_fail")

def set_heating_relay(on):
    GPIO.output(HEATING_RELAY_PIN, GPIO.HIGH if on else GPIO.LOW)
    print(f'set_heating_relay:{on}')

# --- GREE AC CONTROLLER SECTION ---

def start_ac_loop():
    """Start the dedicated event loop that owns every Gree connection."""
    global ac_loop, ac_loop_thread

    if ac_loop is not None:
        return

    ac_loop = asyncio.new_event_loop()
    ac_loop_thread = threading.Thread(
        target=ac_loop.run_forever, name="gree-loop", daemon=True
    )
    ac_loop_thread.start()

def run_on_ac_loop(coro, timeout=60):
    """Run a coroutine on the AC loop from the (synchronous) websocket thread."""
    if ac_loop is None:
        start_ac_loop()

    future = asyncio.run_coroutine_threadsafe(coro, ac_loop)
    try:
        return future.result(timeout=timeout)
    except Exception as e:
        future.cancel()
        print(f"AC loop task failed: {type(e).__name__} - {e}")
        return None

def post_ac_sync(devices):
    """Report discovered units (and their indoor readings) to the API."""
    if not devices:
        return

    try:
        requests.post(f"{API_ENDPOINT}/air-conditioners/sync",
                      json={'devices': devices},
                      headers=Headers,
                      timeout=5)
        print(f"Synced {len(devices)} AC units to the database.")
    except Exception as e:
        print(f"Failed to sync ACs to the database: {e}")

async def init_gree_ac():
    global GREE_DEVICES, gree_lock, last_gree_scan

    # 30-second cooldown between scans to avoid overloading the network
    if time.time() - last_gree_scan < 30:
        return
    last_gree_scan = time.time()

    if gree_lock is None:
        gree_lock = asyncio.Lock()

    print("Scanning and pairing AC units on the network...")

    try:
        discovery = Discovery()
        devices = await discovery.scan(wait_for=5)

        devices_to_sync = []
        for device_info in devices:
            entry = {
                'name': device_info.name,
                'ip': device_info.ip,
                'mac': device_info.mac,
                'port': device_info.port
            }
            devices_to_sync.append(entry)

            # Units are keyed by MAC, not IP: a DHCP lease change must not look
            # like a new unit, or the room it belongs to would be lost.
            if device_info.mac in GREE_DEVICES:
                continue

            try:
                device = Device(device_info)
                await device.bind()
                GREE_DEVICES[device_info.mac] = device
                print(f"AC successfully paired! IP: {device_info.ip}, Mac: {device_info.mac}")

                # Capture the unit's own indoor sensor while we are connected.
                try:
                    await asyncio.wait_for(device.update_state(), timeout=5.0)
                    if device.current_temperature is not None:
                        entry['reported_temp'] = device.current_temperature
                except Exception:
                    pass  # Reading the indoor sensor is best-effort, never fatal to pairing.

            except Exception as e:
                err_msg = str(e) if str(e) else "Timeout (No response)"
                print(f"Error pairing {device_info.ip}: {err_msg}")
                send_ntfy_alert(f"Error pairing AC unit {device_info.ip}: {err_msg}", "warning", key=f"ac_init_{device_info.ip}")

        post_ac_sync(devices_to_sync)

    except Exception as e:
        print(f"Error during search: {e}")

def desired_state(unit):
    """
    Everything we want a unit to be, as a tuple that can be compared.

    While a unit is off, mode, setpoint and airflow are all meaningless, so
    they are left out entirely — otherwise a target change on a sleeping unit
    would look like a reason to wake the LAN up and talk to it.
    """
    if not bool(unit.get('power')):
        return (False,)

    return (
        True,
        int(float(unit.get('target_temp') or 24)),
        unit.get('mode') or 'cool',
        unit.get('fan_speed') or 'auto',
        unit.get('swing_v') or 'off',
        unit.get('swing_h') or 'off',
        bool(unit.get('xfan')),
    )

def apply_setting(device, attribute, value):
    """Set an optional device property, tolerating older library versions."""
    if value is None or not hasattr(device, attribute):
        return

    setattr(device, attribute, value)

async def send_gree_command(ac, desired):
    """Push desired state to one unit. Returns a sync entry if a reading was observed."""
    global GREE_DEVICES, gree_lock

    mac = ac.get('mac')
    ip = ac.get('ip')

    device = GREE_DEVICES.get(mac)
    if not device:
         print(f"[{ip}] AC not in list, attempting to reconnect...")
         await init_gree_ac()
         device = GREE_DEVICES.get(mac)

    if not device:
         # If still not found, do nothing
         return None

    power_on = desired[0]
    print(f"send_gree_command: IP={ip}, desired={desired}")
    async with gree_lock:
        try:
            await asyncio.wait_for(device.update_state(), timeout=5.0)

            device.power = power_on
            if power_on:
                _, target_temp, mode, fan_speed, swing_v, swing_h, xfan = desired

                apply_setting(device, 'mode', MODES.get(mode))
                device.target_temperature = target_temp
                apply_setting(device, 'fan_speed', FAN_SPEEDS.get(fan_speed))
                apply_setting(device, 'vertical_swing', VERTICAL_SWING.get(swing_v))
                apply_setting(device, 'horizontal_swing', HORIZONTAL_SWING.get(swing_h))

                # Gree's own post-cooling coil dry. Re-asserted with everything
                # else so a unit someone reset with the remote gets it back.
                apply_setting(device, 'xfan', xfan)

            await asyncio.wait_for(device.push_state_update(), timeout=5.0)
            print(f"[{ip}] Gree command SUCCESSFUL: {desired}")

            last_sent_ac_state[mac] = (desired, time.time())

            observed = None
            if device.current_temperature is not None:
                observed = {
                    'mac': mac,
                    'name': ac.get('name') or mac,
                    'ip': ip,
                    'port': ac.get('port') or 7000,
                    'reported_temp': device.current_temperature,
                }

            await asyncio.sleep(1.5)
            return observed

        except Exception as e:
             err_msg = str(e) if str(e) else "TimeoutError (The AC unit did not respond)"
             print(f"[{ip}] Gree command error: {type(e).__name__} - {err_msg}")

             # On a communication error drop the binding and the cached desired
             # state, so the next pass reconnects and re-asserts rather than
             # assuming the unit already matches.
             GREE_DEVICES.pop(mac, None)
             last_sent_ac_state.pop(mac, None)

             send_ntfy_alert(f"Gree command error ({ip}): {err_msg}", "warning", key=f"ac_cmd_{ip}")
             return None

def needs_command(mac, desired):
    """Skip units already in the desired state, re-asserting periodically."""
    previous = last_sent_ac_state.get(mac)
    if previous is None:
        return True

    prev_desired, sent_at = previous

    if time.time() - sent_at > AC_RESEND_INTERVAL:
        return True

    return prev_desired != desired

def apply_units(units):
    """
    Apply the unit commands from a control document.

    A split AC has its own thermostat, so we never bang-bang its power against
    the room temperature — that is what wears out a compressor. We set power,
    mode, setpoint and airflow, and let the unit regulate itself.
    """
    async def update_acs():
        observed = []

        for unit in units:
            mac = unit.get('mac')
            if not mac:
                continue

            desired = desired_state(unit)

            if not needs_command(mac, desired):
                continue

            result = await send_gree_command(unit, desired)
            if result:
                observed.append(result)

        return observed

    observed = run_on_ac_loop(update_acs()) or []

    # Report indoor readings so rooms sourcing temperature from their AC,
    # and rooms showing it as a secondary value, stay current.
    post_ac_sync(observed)

def turn_off_all_acs():
    """Force every unit we have ever paired with off. Used on shutdown."""
    known = []
    for mac, device in GREE_DEVICES.items():
        info = getattr(device, 'device_info', None)
        known.append({'mac': mac, 'ip': getattr(info, 'ip', None)})

    if not known:
        return

    async def stop_all():
        for ac in known:
            await send_gree_command(ac, (False,))

    run_on_ac_loop(stop_all(), timeout=30)

def execute_control(control):
    """
    Apply a control document from the API.

    No thermostat logic lives here any more. The API owns every decision; this
    function is the hand that moves the relay and talks to the AC units.
    """
    global boiler_on, last_control_at, last_control, failsafe_tripped

    if not isinstance(control, dict):
        return

    last_control_at = time.time()
    last_control = control
    failsafe_tripped = False

    boiler = bool(control.get('boiler'))
    units = control.get('units', [])

    if boiler != boiler_on:
        boiler_on = boiler
        print(f"ACTION: Boiler {'ON' if boiler else 'OFF'}.")
        set_heating_relay(boiler)

    apply_units(units)

    any_cooling = any(u.get('power') and u.get('mode') != 'heat' for u in units)
    report_actual_state(boiler, any_cooling)

def report_actual_state(boiler, any_cooling):
    """
    Tell the API what the hardware is actually doing.

    hvac_until is deliberately omitted: boost is owned by the API, and echoing
    it back from here would let a stale document extend or cancel a boost.
    """
    global heating_on, cooling_on

    if boiler == heating_on and any_cooling == cooling_on:
        return

    heating_on = boiler
    cooling_on = any_cooling

    send_state({ 'heating_on': 1 if boiler else 0, 'cooling_on': 1 if any_cooling else 0 })

def fail_safe(reason):
    """Drop everything to a known-off state and report it."""
    global boiler_on, failsafe_tripped

    print(f"FAILSAFE: {reason}. Turning everything OFF.")

    if boiler_on:
        boiler_on = False
    set_heating_relay(False)

    try:
        turn_off_all_acs()
    except Exception as e:
        print(f"Failsafe could not reach the AC units: {e}")

    failsafe_tripped = True
    report_actual_state(False, False)
    send_ntfy_alert(f"Climate control failsafe: {reason}", "warning", key="failsafe")

def poll_unit_state():
    """
    Read what the units actually report, without commanding them.

    Only ever called inside a live window, because interrogating a Gree over
    the LAN is not free: the chatter competes with the commands that matter,
    and nothing is listening to the answer unless a dashboard is open.
    """
    units = [u for u in (last_control or {}).get('units', []) if u.get('mac')]
    if not units:
        return

    async def read_all():
        observed = []

        async with gree_lock:
            for unit in units:
                device = GREE_DEVICES.get(unit['mac'])
                if not device:
                    continue

                try:
                    await asyncio.wait_for(device.update_state(), timeout=5.0)
                except Exception as exc:
                    print(f"[{unit.get('ip')}] live poll failed: {type(exc).__name__}")
                    continue

                if device.current_temperature is None:
                    continue

                observed.append({
                    'mac': unit['mac'],
                    'name': unit.get('name') or unit['mac'],
                    'ip': unit.get('ip'),
                    'port': unit.get('port') or 7000,
                    'reported_temp': device.current_temperature,
                })

        return observed

    post_ac_sync(run_on_ac_loop(read_all()) or [])

def live_poller():
    """Poll the units while a dashboard is watching, and not a moment longer."""
    while True:
        time.sleep(LIVE_POLL_INTERVAL)

        if failsafe_tripped:
            continue

        live_until = (last_control or {}).get('live_until') or 0

        if time.time() < live_until:
            poll_unit_state()

def control_watchdog():
    """
    Fail safe when the API stops talking to us.

    The Pi has no autonomy by design, so a dead API, an expired document or a
    dropped websocket must not leave the boiler running unattended.
    """
    while True:
        time.sleep(WATCHDOG_INTERVAL)

        if failsafe_tripped:
            continue

        if last_control_at == 0:
            continue

        age = time.time() - last_control_at
        expires_at = (last_control or {}).get('expires_at') or 0

        if age > CONTROL_TIMEOUT:
            fail_safe(f"no control document for {int(age)}s")
        elif expires_at and time.time() > expires_at:
            fail_safe("control document expired")

def fetch_control():
    """Pull the current control document, used at startup and after a reconnect."""
    try:
        response = requests.get(f'{API_ENDPOINT}/params', headers=Headers, timeout=5)
        if response.ok:
            return response.json().get('control')
        print(f"Warning: /params returned {response.status_code}")
    except requests.RequestException as exc:
        print(f"Warning: could not fetch control document: {exc}")

    return None

def on_open(ws):
    print("WebSocket connection opened. Subscribing to channel...")
    subscribe_msg = json.dumps({
        "event": "pusher:subscribe",
        "data": { "channel": CHANNEL_NAME }
    })
    ws.send(subscribe_msg)

def comparable_control(control):
    """
    The parts of a control document that describe what the hardware should do.

    expires_at moves on every evaluation and live_until moves every time a
    dashboard is opened, so neither belongs in the comparison that decides
    whether the units need to hear from us again. Somebody looking at a page
    is not a reason to talk to a compressor.
    """
    ignored = ('expires_at', 'live_until')

    return {k: v for k, v in control.items() if k not in ignored}

def on_message(ws, message):
    global previous_control_data, last_control_at, last_control
    try:
        data = json.loads(message)
        if data.get('event') == EVENT_NAME:
            event_data = json.loads(data['data'])
            reading = event_data.get('reading')

            if not reading: return

            control = reading.get('control')
            if not control: return

            current = comparable_control(control)

            if current != previous_control_data:
                execute_control(control)
                previous_control_data = current
            else:
                # Nothing to change, but the API is alive: refresh the deadline
                # so the watchdog does not trip during a steady period.
                last_control_at = time.time()
                last_control = control
        elif data.get('event') == 'pusher:connection_established':
             print("Subscription successful! Listening for updates...")
             if "ws_error" in last_notifications:
                 del last_notifications["ws_error"]

             # A reconnect may have missed changes, so resync from the API.
             control = fetch_control()
             if control:
                 execute_control(control)
                 previous_control_data = comparable_control(control)
    except Exception as e:
        print(f"Error processing message: {e}")
        send_ntfy_alert(f"Error processing WebSocket message: {e}", "warning", key="ws_msg_error")

def on_error(ws, error):
    print(f"WebSocket Error: {error}")
    send_ntfy_alert(f"WebSocket Error: {error}", "warning", key="ws_error")

def on_close(ws, close_status_code, close_msg):
    print(f"WebSocket connection closed ({close_status_code}: {close_msg}). Reconnecting in 5 seconds...")

def start_websocket_client():
    global ws_app
    ws_url = f"{REVERB_HOST}/app/{APP_KEY}?protocol=7&client=js&version=7.0.6"
    
    while True:
        try:
            ws_app = websocket.WebSocketApp(
                ws_url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            ws_app.run_forever(ping_interval=30, ping_timeout=10)
        except Exception as e:
            print(f"WS Runtime Error: {e}")
        
        print("WS Reconnecting in 5s...")
        time.sleep(5)

if __name__ == '__main__':
    try:
        print("Starting Pi Heater/AC Controller via WebSockets...")
        set_heating_relay(False)
        send_state({ 'heating_on': 0, 'cooling_on': 0 })

        print("Initializing Gree AC devices...")
        start_ac_loop()
        run_on_ac_loop(init_gree_ac(), timeout=60)

        report_unmapped_settings()
        threading.Thread(target=control_watchdog, name="control-watchdog", daemon=True).start()
        threading.Thread(target=live_poller, name="live-poller", daemon=True).start()

        # Act on the current state immediately rather than waiting for the
        # next sensor reading to produce a broadcast.
        initial_control = fetch_control()
        if initial_control:
            execute_control(initial_control)
            previous_control_data = comparable_control(initial_control)

        start_websocket_client()
    except Exception as e:
        print(f"Fatal script error: {e}")
        send_ntfy_alert(f"Fatal script error: {e}", "warning", key="fatal_script_error")
        handle_exit(None, None)

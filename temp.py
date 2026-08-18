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

try:
    import kasa
except ImportError:
    # Energy metering is an extra, not a dependency of climate control. A Pi
    # without python-kasa installed still heats and cools the house.
    kasa = None

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
DEVICE_SETTINGS = ('mode', 'fan_speed', 'vertical_swing', 'horizontal_swing', 'xfan',
                   'quiet', 'turbo')

def _by_member(mapping):
    """
    Invert a name->enum map, for reading a unit's answer back.

    greeclimate returns these properties as plain ints. Keying by the enum
    member still works because they are IntEnums, which hash as their value, so
    a lookup with a bare int finds the member. Anything unrecognised misses and
    yields None, which reads as "the unit said something we have no word for" --
    the right answer, and never a wrong one.
    """
    return {member: name for name, member in mapping.items() if member is not None}

FAN_SPEEDS_BY_MEMBER = _by_member(FAN_SPEEDS)
VERTICAL_SWING_BY_MEMBER = _by_member(VERTICAL_SWING)
HORIZONTAL_SWING_BY_MEMBER = _by_member(HORIZONTAL_SWING)
MODES_BY_MEMBER = _by_member(MODES)

def _flag(value):
    """A tri-state flag: None stays None rather than collapsing to False."""
    return None if value is None else bool(value)

def observed_state(device):
    """
    Everything the unit says about itself, in the vocabulary the API uses.

    update_state() has already pulled the whole set off the hardware, so this
    costs nothing beyond the reading we were taking anyway -- and it is the only
    description of the units in this system that is not an echo of what we sent.
    """
    return {
        'power': bool(device.power),
        'mode': MODES_BY_MEMBER.get(getattr(device, 'mode', None)),
        'target_temp': getattr(device, 'target_temperature', None),
        'fan_speed': FAN_SPEEDS_BY_MEMBER.get(getattr(device, 'fan_speed', None)),
        'swing_v': VERTICAL_SWING_BY_MEMBER.get(getattr(device, 'vertical_swing', None)),
        'swing_h': HORIZONTAL_SWING_BY_MEMBER.get(getattr(device, 'horizontal_swing', None)),
        'xfan': _flag(getattr(device, 'xfan', None)),
        'quiet': _flag(getattr(device, 'quiet', None)),
        'turbo': _flag(getattr(device, 'turbo', None)),
    }

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

# Metering gets its own loop. See start_plug_loop for why sharing one with the
# actuators cost the house its cooling.
plug_loop = None
plug_loop_thread = None

# Last state actually pushed to each unit, keyed by MAC: (desired, sent_at).
# A record of our own words, and nothing more. Good only for not repeating
# ourselves when the same document arrives twice.
last_sent_ac_state = {}

# What each unit last told us about itself, keyed by MAC: (state, read_at).
# Kept apart from last_sent_ac_state deliberately: one is what we asked for and
# the other is what is true, and only the second can answer whether a unit needs
# to be spoken to. Where we have a recent reading it decides, because telling a
# unit to do what it is already doing is a beep for nothing.
last_observed_ac_state = {}

# How long a reading is trusted to still describe the unit. Both readers run at
# least this often, so in practice one is nearly always in hand.
OBSERVATION_TRUSTED_SECONDS = 90

# How often the units are read, so the dashboard knows what they are doing even
# with nobody watching. Reading only: nothing is commanded on a timer, because a
# Gree beeps at every command it accepts and a house nobody is talking to should
# make no noise at all.
OBSERVE_INTERVAL = 60

# While a dashboard is open the API asks us to interrogate the units directly,
# so the page shows what they actually report rather than what we last told
# them. The window is carried in the control document and expires on its own.
LIVE_POLL_INTERVAL = 15

# Live reads share gree_lock with the commands, so they get a tighter budget
# than a command does: a unit that has gone quiet should cost a reading, not
# the ability to control the unit beside it.
LIVE_READ_TIMEOUT = 2.0

# How long a command gets to land before a unit still doing the opposite is
# read as somebody's own doing rather than as our command still travelling.
MANUAL_SETTLE_SECONDS = 30

# Tapo metering plugs, keyed by MAC for the same reason the ACs are. Unlike the
# units these are polled even with nobody watching, because consumption is the
# only signal that says whether a command actually reached the hardware.
PLUG_DEVICES = {}
PLUG_POLL_INTERVAL = 120
last_plug_poll_at = 0

# Rediscovery is not free — it opens connections and, failing, waits on
# timeouts. When there is nothing to find, back off rather than trying again
# on every poll.
PLUG_DISCOVERY_BACKOFF = 900
last_plug_discovery_at = 0

# Addresses whose protocol this python-kasa cannot speak, so we stop dialling
# them. Cleared by a restart, which is what installing a newer library means.
unsupported_plugs = {}

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

# TP-Link account credentials. Tapo's local protocol authenticates with them,
# but the traffic stays on the LAN — nothing is sent to TP-Link, and these
# never leave the Pi.
TAPO_EMAIL = os.getenv('TAPO_EMAIL')
TAPO_PASSWORD = os.getenv('TAPO_PASSWORD')

# Optional, comma separated. Broadcast discovery is the tidier route, but it
# does not survive client isolation on the access point or a plug on another
# subnet — in which case asking the address directly is the only way in.
TAPO_HOSTS = [h.strip() for h in (os.getenv('TAPO_HOSTS') or '').split(',') if h.strip()]
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

    return run_on_loop(ac_loop, coro, timeout, 'AC')

def start_plug_loop():
    """
    A second event loop, for metering only.

    Plugs must never share a loop with the actuators. An unreachable Tapo takes
    timeouts and a rediscovery sweep to give up, and on a shared loop every Gree
    command queues behind that — including the ones issued from the websocket
    thread, which then cannot answer a ping and loses the connection that
    delivers control documents. Metering is a nicety; it is not allowed to cost
    the house its cooling.
    """
    global plug_loop, plug_loop_thread

    if plug_loop is not None:
        return

    plug_loop = asyncio.new_event_loop()
    plug_loop_thread = threading.Thread(
        target=plug_loop.run_forever, name="plug-loop", daemon=True
    )
    plug_loop_thread.start()

def run_on_plug_loop(coro, timeout=60):
    if plug_loop is None:
        start_plug_loop()

    return run_on_loop(plug_loop, coro, timeout, 'plug')

def run_on_loop(loop, coro, timeout, label):
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    try:
        return future.result(timeout=timeout)
    except Exception as e:
        future.cancel()
        print(f"{label} loop task failed: {type(e).__name__} - {e}")
        return None

def post_plug_sync(plugs):
    """Report the plugs and what they are currently drawing."""
    if not plugs:
        return

    try:
        requests.post(f"{API_ENDPOINT}/smart-plugs/sync",
                      json={'plugs': plugs},
                      headers=Headers,
                      timeout=5)
    except Exception as e:
        print(f"Failed to sync plugs to the database: {e}")

async def find_plug_candidates(credentials):
    """
    Every Tapo device we can reach, by whichever route works.

    Broadcast discovery is the tidier route and keys nothing to an address, but
    it dies quietly against client isolation on the access point or a plug on
    another subnet. TAPO_HOSTS is the way through that.
    """
    candidates = {}
    problems = []

    for host in TAPO_HOSTS:
        if host in unsupported_plugs:
            problems.append(f'{host}: {unsupported_plugs[host]}')
            continue

        try:
            candidates[host] = await kasa.Discover.discover_single(host, credentials=credentials)
        except Exception as exc:
            # Worth repeating verbatim: this is where a device says it speaks a
            # protocol this python-kasa does not, which reads nothing like a
            # network problem and has an entirely different fix.
            problems.append(f'{host}: {type(exc).__name__} {exc}')
            print(f"[{host}] direct connection failed: {type(exc).__name__} - {exc}")

            # A device whose protocol this library cannot speak will refuse us
            # identically forever. Remember it, so we stop opening connections
            # to it every couple of minutes for the life of the process. A
            # restart — which is what upgrading python-kasa entails — retries.
            if type(exc).__name__ == 'UnsupportedDeviceError':
                unsupported_plugs[host] = f'{type(exc).__name__}: {exc}'
                print(f"[{host}] giving up on this address until the service restarts.")

    if candidates:
        return candidates, problems

    try:
        found = await kasa.Discover.discover(credentials=credentials, discovery_timeout=5)
    except Exception as exc:
        print(f"Plug discovery failed: {type(exc).__name__} - {exc}")
        problems.append(f'broadcast: {type(exc).__name__} {exc}')
        found = {}

    return found, problems

def looks_like_a_plug(device):
    """
    Whether this is worth trying to log in to.

    A TP-Link account sees every Tapo device on the network — cameras, hubs,
    bulbs — and discovery announces the type before anyone authenticates. A
    camera will never have an energy module, and its HTTPS transport fails a
    TLS handshake on the way to finding that out, so it is skipped rather than
    retried and reported every time.
    """
    device_type = getattr(device, 'device_type', None)
    if device_type is None:
        return True

    name = str(getattr(device_type, 'value', device_type)).lower()

    return any(kind in name for kind in ('plug', 'strip', 'switch', 'unknown'))

async def retry_every_protocol(host, credentials):
    """
    Let python-kasa try each protocol against an address that refused us.

    Discovery picks a transport from the device's announcement, and that choice
    can be wrong: a plug answering on the HTTPS transport fails a TLS handshake
    that a KLAP connection would have sailed through. Returns a connected
    device, or None if nothing worked.
    """
    attempt = getattr(kasa.Discover, 'try_connect_all', None)
    if attempt is None:
        return None

    try:
        device = await attempt(host, credentials=credentials)
    except Exception as exc:
        print(f"[{host}] no protocol worked: {type(exc).__name__} - {exc}")
        return None

    if device is None:
        return None

    try:
        await device.update()
    except Exception as exc:
        print(f"[{host}] connected but could not read: {type(exc).__name__} - {exc}")
        return None

    print(f"[{host}] reached on the second attempt as {type(device).__name__}")
    return device

async def init_plugs():
    """
    Find the Tapo plugs and key them by MAC.

    MAC rather than address, for the same reason the ACs use it: a DHCP lease is
    not an identity. The credentials are a TP-Link account, but the handshake
    and everything after it stay on the LAN.
    """
    global PLUG_DEVICES

    if not (TAPO_EMAIL and TAPO_PASSWORD):
        return

    credentials = kasa.Credentials(TAPO_EMAIL, TAPO_PASSWORD)
    found, problems = await find_plug_candidates(credentials)

    discovered = {}
    rejected = []
    ignored = []

    for address, device in found.items():
        if not looks_like_a_plug(device):
            label = f'{getattr(device, "model", "?")} ({getattr(device, "device_type", "?")})'
            print(f"[{address}] {label} is not a plug; skipping.")
            ignored.append(label)
            continue

        try:
            await device.update()
        except Exception as exc:
            print(f"[{address}] plug login failed: {type(exc).__name__} - {exc}")

            device = await retry_every_protocol(address, credentials)
            if device is None:
                rejected.append(f'{address} ({type(exc).__name__})')
                continue

        mac = (getattr(device, 'mac', '') or '').lower()
        if not mac:
            rejected.append(f'{address} (no MAC)')
            continue

        # Only metering plugs are of interest; a plug that cannot measure has
        # nothing to tell us the control document does not already say. Said
        # out loud, because a P110 that reads as unmetered means the energy
        # interface moved again, not that the socket is a dumb one.
        if read_plug_watts(device) is None:
            rejected.append(f'{getattr(device, "alias", address)} (no energy data)')
            print(f"[{mac}] {getattr(device, 'alias', '?')} reports no energy data; ignoring.")
            continue

        discovered[mac] = device

    PLUG_DEVICES = discovered
    print(f"Found {len(PLUG_DEVICES)} metering plug(s) out of {len(found)} device(s).")

    if discovered:
        return

    # Each of these has a different fix, so the alert has to distinguish them
    # rather than just saying nothing was found.
    if problems:
        # An address we were told to use refused us. That is never a network
        # problem worth chasing — it is the device telling us something.
        detail = '; '.join(problems)
    elif not found:
        detail = 'nothing answered discovery — check TAPO_HOSTS, subnet or AP client isolation'
    elif rejected:
        detail = 'found but unusable: ' + ', '.join(rejected)
    elif ignored:
        detail = ('only non-plug devices answered (' + ', '.join(ignored)
                  + ') — the plug did not, so set TAPO_HOSTS to its address')
    else:
        detail = 'no devices to try'

    send_ntfy_alert(f"No metering plugs: {detail}", "warning", key="no_plugs")

def energy_module(device):
    """
    The device's energy module, or None if it has no metering.

    python-kasa keys modules by a str subclass, so Module.Energy and the plain
    name both work; the constant is preferred and the string is the fallback
    for builds that predate it.
    """
    modules = getattr(device, 'modules', None)
    if not modules or not hasattr(modules, 'get'):
        return None

    key = getattr(getattr(kasa, 'Module', None), 'Energy', 'Energy')

    try:
        return modules.get(key) or modules.get('Energy')
    except Exception:
        return None

def read_plug_watts(device):
    """
    Current draw in watts.

    Returning None rather than 0 is the point: a read that failed must never
    be reported as a plug that measured nothing, or a dead unit would look
    exactly like an idle one.
    """
    energy = energy_module(device)

    if energy is not None:
        for attribute in ('current_consumption', 'power'):
            value = getattr(energy, attribute, None)
            if value is not None:
                return float(value)

    # Pre-module builds exposed the meter on the device itself.
    for attribute in ('current_consumption', 'emeter_realtime'):
        value = getattr(device, attribute, None)
        if value is None:
            continue
        if isinstance(value, dict):
            if value.get('power') is not None:
                return float(value['power'])
            if value.get('power_mw') is not None:
                return float(value['power_mw']) / 1000.0
        else:
            return float(value)

    return None

def read_plug_energy_today(device):
    """Today's total in kWh, or None if this build does not report it."""
    energy = energy_module(device)

    if energy is not None:
        for attribute in ('consumption_today', 'energy_today'):
            value = getattr(energy, attribute, None)
            if value is not None:
                return float(value)

    value = getattr(device, 'emeter_today', None)

    return float(value) if value is not None else None

def poll_plugs():
    """Read every known plug and report it. Rediscovers if we have none."""
    if not (TAPO_EMAIL and TAPO_PASSWORD):
        return

    async def read_all():
        global last_plug_discovery_at

        if not PLUG_DEVICES and time.time() - last_plug_discovery_at >= PLUG_DISCOVERY_BACKOFF:
            last_plug_discovery_at = time.time()
            await init_plugs()

        readings = []

        for mac, device in list(PLUG_DEVICES.items()):
            try:
                await asyncio.wait_for(device.update(), timeout=5.0)
            except Exception as exc:
                print(f"[{mac}] plug read failed: {type(exc).__name__}")
                # Drop the binding so the next pass rediscovers rather than
                # holding a handle to something that has moved or gone.
                PLUG_DEVICES.pop(mac, None)
                continue

            readings.append({
                'mac': mac,
                'name': getattr(device, 'alias', None) or mac,
                'ip': getattr(device, 'host', None),
                'watts': read_plug_watts(device),
                'energy_today': read_plug_energy_today(device),
            })

        return readings

    post_plug_sync(run_on_plug_loop(read_all()) or [])

def plug_poller():
    """
    Read the plugs on a slow cadence, faster while a dashboard is open.

    Consumption is the only feedback this system has that a command actually
    landed — everything else reports what we *sent* — so it is worth a baseline
    poll even when nobody is looking.
    """
    while True:
        time.sleep(LIVE_POLL_INTERVAL)

        live = time.time() < ((last_control or {}).get('live_until') or 0)
        due = time.time() - last_plug_poll_at >= PLUG_POLL_INTERVAL

        if live or due:
            poll_plugs()
            globals()['last_plug_poll_at'] = time.time()

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
        bool(unit.get('quiet')),
        bool(unit.get('turbo')),
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
                _, target_temp, mode, fan_speed, swing_v, swing_h, xfan, quiet, turbo = desired

                apply_setting(device, 'mode', MODES.get(mode))
                device.target_temperature = target_temp

                # Order matters. Quiet and turbo both override the fan speed
                # field at the unit, so they are cleared before the speed is
                # written and only then set to what we actually want. Written
                # every time, including when false: a unit still holding turbo
                # from the handset would otherwise ignore every speed we send.
                apply_setting(device, 'quiet', False)
                apply_setting(device, 'turbo', False)
                apply_setting(device, 'fan_speed', FAN_SPEEDS.get(fan_speed))
                apply_setting(device, 'quiet', quiet)
                apply_setting(device, 'turbo', turbo)

                apply_setting(device, 'vertical_swing', VERTICAL_SWING.get(swing_v))
                apply_setting(device, 'horizontal_swing', HORIZONTAL_SWING.get(swing_h))

                # Gree's own post-cooling coil dry. Re-asserted with everything
                # else so a unit someone reset with the remote gets it back.
                apply_setting(device, 'xfan', xfan)

            await asyncio.wait_for(device.push_state_update(), timeout=5.0)
            print(f"[{ip}] Gree command SUCCESSFUL: {desired}")

            last_sent_ac_state[mac] = (desired, time.time())

            # The unit has just changed, so the last reading no longer describes
            # it. Drop it rather than let a pre-command observation answer for
            # the state the command produced.
            last_observed_ac_state.pop(mac, None)

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

             # On a communication error drop the binding and everything we
             # thought we knew, so the next pass reconnects and finds out rather
             # than assuming. The reading goes too: the command may have landed
             # in part, which makes the last observation a description of a unit
             # that no longer exists.
             GREE_DEVICES.pop(mac, None)
             last_sent_ac_state.pop(mac, None)
             last_observed_ac_state.pop(mac, None)

             send_ntfy_alert(f"Gree command error ({ip}): {err_msg}", "warning", key=f"ac_cmd_{ip}")
             return None

def needs_command(unit, desired):
    """
    Whether this unit actually needs to be spoken to.

    Answered from what the unit last said about itself, whenever that answer is
    recent enough to still hold. The unit is the only authority on what the unit
    is doing: a command is needed when the hardware disagrees with the document,
    not when the document differs from something we said earlier.

    That distinction is the whole difference between switching a unit off in the
    Gree app and hearing the house beep at it a minute later, and not.

    Falls back to what we last sent only when there is no fresh reading -- no
    better information exists then, and repeating ourselves is at least bounded.

    No periodic resend at all any more. A Gree chirps at every command it
    accepts, so a timer that re-sends whether or not anything is wrong is a beep
    in the living room, on a schedule, for nothing.
    """
    mac = unit.get('mac')
    observed = last_observed_ac_state.get(mac)

    if observed is not None:
        state, read_at = observed

        if time.time() - read_at <= OBSERVATION_TRUSTED_SECONDS:
            return bool(disagreements(unit, state))

    previous = last_sent_ac_state.get(mac)

    if previous is None:
        return True

    prev_desired, _ = previous

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

            if not needs_command(unit, desired):
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

def disagreements(unit, state):
    """
    Which settings the unit is not holding, out of the ones we asked for.

    Deliberately narrow. A Gree reports fields it is currently ignoring — a
    setpoint in fan mode, a fan speed of its own choosing under turbo — and
    treating those as drift would have us re-commanding units that are doing
    exactly as they were told, forever.
    """
    if not bool(unit.get('power')):
        # Everything else is meaningless on a unit we want off, and the unit
        # reports whatever it was last left with.
        return ['power'] if state.get('power') else []

    checks = [
        ('power', True, bool(state.get('power'))),
        ('mode', unit.get('mode'), state.get('mode')),
        ('xfan', bool(unit.get('xfan')), state.get('xfan')),
        ('quiet', bool(unit.get('quiet')), state.get('quiet')),
        ('turbo', bool(unit.get('turbo')), state.get('turbo')),
        ('swing_v', unit.get('swing_v'), state.get('swing_v')),
        ('swing_h', unit.get('swing_h'), state.get('swing_h')),
    ]

    # The unit picks its own speed under quiet or turbo and reports that. It
    # also picks its own under 'auto', which is what asking for auto *means* --
    # a concrete speed coming back is the unit complying, not defying.
    if not (unit.get('quiet') or unit.get('turbo') or unit.get('fan_speed') == 'auto'):
        checks.append(('fan_speed', unit.get('fan_speed'), state.get('fan_speed')))

    # Ignored in fan mode, and the unit says so by reporting something else.
    if unit.get('mode') != 'fan':
        checks.append(('target_temp', unit.get('target_temp'), state.get('target_temp')))

    # A None on the unit's side means "no word for what it said", which is not
    # evidence of disagreement.
    return [name for name, ours, theirs in checks if theirs is not None and ours != theirs]

def manual_power_change(unit, state):
    """
    Whether a person switched this unit themselves — handset, or the Gree app.

    Only ever says yes on strong evidence: we must have a record of what we
    last sent, it must have had time to land, and the unit must nonetheless be
    doing the opposite. Without that record a human is indistinguishable from a
    command still in flight, and guessing would hand the house to a dropped
    packet.

    Returns True or False for what the person chose, or None for "no evidence",
    which is not the same as False and must not be reported as one.
    """
    previous = last_sent_ac_state.get(unit.get('mac'))

    if previous is None:
        return None

    sent, sent_at = previous

    if time.time() - sent_at < MANUAL_SETTLE_SECONDS:
        return None

    theirs = state.get('power')

    if theirs is None or bool(sent[0]) == bool(theirs):
        return None

    return bool(theirs)

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
                    # Tighter than a command's timeout on purpose. This lock is
                    # shared with send_gree_command, so a unit that has gone
                    # quiet must cost us a reading, never the ability to control
                    # the unit next to it.
                    await asyncio.wait_for(device.update_state(), timeout=LIVE_READ_TIMEOUT)

                    # Inside the same guard as the read. Reading the properties
                    # back is as fallible as reaching the unit was -- this build
                    # of greeclimate decides what each of them does -- and a
                    # throw here must cost this unit's reading and no more. Left
                    # outside, it escaped the whole poll and took the other
                    # unit's reading with it.
                    state = observed_state(device)
                    temperature = device.current_temperature
                except Exception as exc:
                    print(f"[{unit.get('ip')}] live poll failed: {type(exc).__name__}: {exc}")
                    continue

                # The only reading in the system that describes the hardware
                # rather than our intent, so it is reported even when the unit
                # has no temperature to offer.
                entry = {
                    'mac': unit['mac'],
                    'name': unit.get('name') or unit['mac'],
                    'ip': unit.get('ip'),
                    'port': unit.get('port') or 7000,
                    'reported_temp': temperature,
                    'reported_state': state,
                }

                # Recorded before anything is decided from it. This is what the
                # unit is, and needs_command answers from it rather than from
                # any memory of our own commands.
                last_observed_ac_state[unit['mac']] = (state, time.time())

                manual = manual_power_change(unit, state)

                if manual is not None:
                    # Somebody switched it themselves. Report that and leave it
                    # alone: the API turns it into the unit's new intent, and
                    # the document that comes back stops the re-assert
                    # undoing it.
                    print(f"[{unit.get('ip')}] switched {'on' if manual else 'off'} by hand. Following it.")
                    entry['manual_power'] = manual
                    observed.append(entry)

                    # Nothing more to record. The document that comes back will
                    # say the same thing, and needs_command reads that against
                    # the observation just taken -- which already agrees -- so
                    # no command follows and nothing beeps.
                    continue

                observed.append(entry)

                # A command that never landed, or a setting the unit declined.
                # Reported and not acted on: the card shows it as not applied
                # and you can ask again, which is a decision for whoever is
                # looking rather than for a loop that cannot tell the two apart.
                drift = disagreements(unit, state)

                if drift:
                    print(f"[{unit.get('ip')}] not holding {', '.join(drift)}.")

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

def observe_units(units):
    """
    Ask each unit what it is doing, and report what they said.

    Reads only. Nothing here commands anything: a unit that did not take a
    command is not made to take it by being told again, and this used to try,
    which is how the living room ended up beeping once a minute. What it is for
    is knowing -- and unlike the live poll it runs whether or not anybody is
    watching, so the dashboard stays honest about a house nobody has open.
    """
    async def check_all():
        observed = []

        async with gree_lock:
            for unit in units:
                device = GREE_DEVICES.get(unit.get('mac'))

                if not device:
                    continue

                try:
                    await asyncio.wait_for(device.update_state(), timeout=LIVE_READ_TIMEOUT)
                    state = observed_state(device)
                    temperature = device.current_temperature
                except Exception as exc:
                    print(f"[{unit.get('ip')}] read failed: {type(exc).__name__}: {exc}")
                    continue

                entry = {
                    'mac': unit['mac'],
                    'name': unit.get('name') or unit['mac'],
                    'ip': unit.get('ip'),
                    'port': unit.get('port') or 7000,
                    'reported_temp': temperature,
                    'reported_state': state,
                }

                # Recorded before anything is decided from it. This is what the
                # unit is, and needs_command answers from it rather than from
                # any memory of our own commands.
                last_observed_ac_state[unit['mac']] = (state, time.time())

                manual = manual_power_change(unit, state)

                if manual is not None:
                    print(f"[{unit.get('ip')}] switched {'on' if manual else 'off'} by hand. Following it.")
                    entry['manual_power'] = manual
                    observed.append(entry)

                    continue

                observed.append(entry)

                # Said, not acted on. The dashboard shows it as not applied and
                # you can ask again; re-sending on our own would be telling a
                # unit something it has already declined to hear.
                drift = disagreements(unit, state)

                if drift:
                    print(f"[{unit.get('ip')}] not holding {', '.join(drift)}.")

        return observed

    return run_on_ac_loop(check_all()) or []

def unit_observer():
    """
    Keep track of what the units are actually doing.

    The original problem was a unit sitting off for hours while the dashboard
    showed it running. That is a knowing problem, not a commanding one, and it
    is solved by looking: a unit switched off by hand becomes the API's intent
    within the minute, and the card says so, whether or not anybody has the page
    open.

    Every attempt to also *fix* things from here made it worse. A timer that
    re-sent produced a beep every ten minutes; reading first and correcting only
    real differences produced a beep every minute for a setting the unit was
    never going to accept. Commands now go out only when the dashboard asks for
    something new, which is the one moment somebody actually wants the unit
    spoken to.
    """
    while True:
        time.sleep(OBSERVE_INTERVAL)

        if failsafe_tripped or not last_control:
            continue

        try:
            post_ac_sync(observe_units(last_control.get('units', [])))
        except Exception as exc:
            print(f"Unit observation failed: {type(exc).__name__}: {exc}")

def control_watchdog():
    """
    Fail safe when the API stops answering, and recover when it does again.

    The Pi has no autonomy by design, so a dead API, an expired document or a
    dropped websocket must not leave the boiler running unattended. But an old
    document on its own does not mean any of those things — broadcasts are
    driven by sensor readings, so the API can be perfectly healthy and simply
    have had nothing to say. Only a document it will not hand over on request
    is evidence, so this asks before acting, and goes on asking afterwards
    because nothing else clears a fail-safe in a settled house.
    """
    while True:
        time.sleep(WATCHDOG_INTERVAL)

        if last_control_at == 0:
            continue

        age = time.time() - last_control_at
        expires_at = (last_control or {}).get('expires_at') or 0
        stale = age > CONTROL_TIMEOUT or (expires_at and time.time() > expires_at)

        if not stale and not failsafe_tripped:
            continue

        # Silence is not evidence that the API is dead. Broadcasts are driven
        # by sensor readings, so one quiet or flaky ESP looks exactly like a
        # dead controller from here — and the house lost its cooling for it.
        # Ask before failing safe, and keep asking afterwards, because a
        # settled house produces no document change to recover on.
        control = fetch_control()

        if control:
            if failsafe_tripped:
                print("Control document reachable again; resuming.")
            execute_control(control)
            continue

        if not failsafe_tripped:
            reason = ("control document expired" if not age > CONTROL_TIMEOUT
                      else f"no control document for {int(age)}s")
            fail_safe(f"{reason} and the API did not answer")

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

            # An unchanged document is still news after a fail-safe: the
            # hardware was forced off underneath it, so it no longer describes
            # anything. Without this the units stay off for as long as the
            # house stays settled, which is indefinitely, while the dashboard
            # goes on showing them running.
            if current != previous_control_data or failsafe_tripped:
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
        threading.Thread(target=unit_observer, name="unit-observer", daemon=True).start()

        if kasa and TAPO_EMAIL and TAPO_PASSWORD:
            start_plug_loop()
            threading.Thread(target=plug_poller, name="plug-poller", daemon=True).start()
        elif TAPO_EMAIL and not kasa:
            print("WARNING: TAPO_EMAIL is set but python-kasa is not installed; no metering.")

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

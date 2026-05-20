#!/usr/bin/env python
import time
import signal
import sys
import RPi.GPIO as GPIO
import requests
import json
import websocket 
import os
from greeclimate.discovery import Discovery
from greeclimate.device import Device
import asyncio
from dotenv import load_dotenv

# Global variable to store found and paired AC units
GREE_DEVICES = {}
gree_lock = None # Initialized in the event loop
last_gree_scan = 0
ws_app = None

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

# Reading clients from .env
GREE_CORRIDOR_NAME = os.getenv('GREE_CORRIDOR_NAME')
GREE_CORRIDOR_IP = os.getenv('GREE_CORRIDOR_IP')
GREE_CORRIDOR_MAC = os.getenv('GREE_CORRIDOR_MAC')
GREE_BEDROOM_NAME = os.getenv('GREE_BEDROOM_NAME')
GREE_BEDROOM_IP = os.getenv('GREE_BEDROOM_IP')
GREE_BEDROOM_MAC = os.getenv('GREE_BEDROOM_MAC')

NTFY_TOPIC = os.getenv('NTFY_TOPIC')
NOTIFY_COOLDOWN = 3600 # 1 hour
last_notifications = {}

def handle_exit(sig, frame):
    print("Stopping service — turning relay OFF")
    set_heating_relay(False)
    set_cooling_relay(False, 30) # This now turns off the AC units
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

heating_on = False
cooling_on = False
TOLERANCE = 0.2

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

# --- NEW GREE AC CONTROLLER SECTION ---

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
        
        for device_info in devices:
            if device_info.ip in GREE_DEVICES:
                continue
                
            try:
                device = Device(device_info)
                await device.bind()
                GREE_DEVICES[device_info.ip] = device
                print(f"AC successfully paired! IP: {device_info.ip}, Mac: {device_info.mac}")
                
            except Exception as e:
                err_msg = str(e) if str(e) else "Timeout (No response)"
                print(f"Error pairing {device_info.ip}: {err_msg}")
                send_ntfy_alert(f"Error pairing AC unit {device_info.ip}: {err_msg}", "warning", key=f"ac_init_{device_info.ip}")
    except Exception as e:
        print(f"Error during search: {e}")

async def send_gree_command(ip, power_on, target_temp):
    global GREE_DEVICES, gree_lock
    
    device = GREE_DEVICES.get(ip)
    if not device:
         print(f"[{ip}] AC not in list, attempting to reconnect...")
         await init_gree_ac()
         device = GREE_DEVICES.get(ip)
         
    if not device:
         # If still not found, do nothing
         return

    print(f"send_gree_command: IP={ip}, Power={power_on}, TargetTemp={target_temp}")
    async with gree_lock:
        try:
            await asyncio.wait_for(device.update_state(), timeout=5.0)
            
            device.power = power_on
            if power_on:
                device.target_temperature = int(float(target_temp))
            
            await asyncio.wait_for(device.push_state_update(), timeout=5.0)
            print(f"[{ip}] Gree command SUCCESSFUL: Power={power_on}, Temp={target_temp}°C")
            await asyncio.sleep(1.5)
            
        except Exception as e:
             err_msg = str(e) if str(e) else "TimeoutError (The AC unit did not respond)"
             print(f"[{ip}] Gree command error: {type(e).__name__} - {err_msg}")
             
             # If there is a communication error, remove it from the list to reconnect next time
             if ip in GREE_DEVICES:
                 del GREE_DEVICES[ip]
                 
             send_ntfy_alert(f"Gree command error ({ip}): {err_msg}", "warning", key=f"ac_cmd_{ip}")

def set_cooling_relay(on, target_temp):
    async def update_all_acs():
        if GREE_CORRIDOR_IP:
            await send_gree_command(GREE_CORRIDOR_IP, on, target_temp)
        if GREE_BEDROOM_IP:
            await send_gree_command(GREE_BEDROOM_IP, on, target_temp)

    asyncio.run(update_all_acs())

def process_hvac_control(home_data):
    global heating_on, cooling_on
    
    temp = home_data.get('temperature')
    set_temp = home_data.get('set_temp')
    hvac_until = home_data.get('hvac_until') or 0
    mode = home_data.get('mode')
    current_ts = int(time.time())

    if temp is None or set_temp is None or not (10 < temp < 50):
        print(f"Safety: Invalid temperature value or target setpoint. Turning OFF.")
        if heating_on:
            heating_on = False
            set_heating_relay(False)
        if cooling_on:
            cooling_on = False
            set_cooling_relay(False, 30)
        send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })
        return

    if mode == 'cooling':
        if heating_on:
            heating_on = False
            set_heating_relay(False)

        should_stop_cooling = (0 < hvac_until < current_ts)
        if should_stop_cooling and cooling_on:
            cooling_on = False
            print(f"ACTION: Cooling BOOST expired. Turning OFF AC units and switching mode to OFF.")
            set_cooling_relay(False, 30)
            send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0, 'mode': 'off' })
            return

        if not cooling_on and not should_stop_cooling:
            cooling_on = True
            print(f"ACTION: Cooling mode active. Turning on AC units. Target: {set_temp}°C")
            set_cooling_relay(True, set_temp)
            send_state({ 'heating_on': 0, 'cooling_on': 1, 'hvac_until': hvac_until })
        elif cooling_on and previous_control_data.get('set_temp') != set_temp:
            print(f"ACTION: Target temperature changed: {set_temp}°C. Updating AC units.")
            set_cooling_relay(True, set_temp)

    elif mode == 'heating':
        if cooling_on:
            cooling_on = False
            set_cooling_relay(False, 30)

        should_heat = (temp <= (set_temp - TOLERANCE) or hvac_until > current_ts)
        should_stop = (temp >= (set_temp + TOLERANCE) and -1 < hvac_until < current_ts)

        if should_heat and not heating_on:
            heating_on = True
            print(f"ACTION: Temp {temp}°C is below target {set_temp}°C or BOOST active. Heating ON.")
            set_heating_relay(True)
            send_state({ 'heating_on': 1, 'cooling_on': 0, 'hvac_until': hvac_until })

        elif should_stop and heating_on:
            heating_on = False
            print(f"ACTION: Temp {temp}°C is above target {set_temp}°C and BOOST expired. Heating OFF.")
            set_heating_relay(False)
            send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })

        else:
            print(f"IDLE: Temp {temp}°C. Heating is {'ON' if heating_on else 'OFF'}.")

    elif mode == 'off' or mode is None:
        if cooling_on or heating_on:
            print("ACTION: System shutdown (OFF mode).")
            cooling_on = False
            heating_on = False
            set_cooling_relay(False, 30) 
            set_heating_relay(False)
            send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })

def on_open(ws):
    print("WebSocket connection opened. Subscribing to channel...")
    subscribe_msg = json.dumps({
        "event": "pusher:subscribe",
        "data": { "channel": CHANNEL_NAME }
    })
    ws.send(subscribe_msg)

def on_message(ws, message):
    global previous_control_data
    try:
        data = json.loads(message)
        if data.get('event') == EVENT_NAME:
            event_data = json.loads(data['data'])
            current_control_data = event_data.get('reading') 
            
            if current_control_data is None: return

            if current_control_data != previous_control_data:
                process_hvac_control(current_control_data)
                previous_control_data = current_control_data
        elif data.get('event') == 'pusher:connection_established':
             print("Subscription successful! Listening for updates...")
             if "ws_error" in last_notifications:
                 del last_notifications["ws_error"]
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
        send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })

        print("Initializing Gree AC devices...")
        asyncio.run(init_gree_ac())

        start_websocket_client()
    except Exception as e:
        print(f"Fatal script error: {e}")
        send_ntfy_alert(f"Fatal script error: {e}", "warning", key="fatal_script_error")
        handle_exit(None, None)

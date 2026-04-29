#!/usr/bin/env python
import time
import signal
import sys
import RPi.GPIO as GPIO
import requests
import json
import websocket # Import the new library
import os
from dotenv import load_dotenv

load_dotenv()

# Setup GPIO
GPIO.cleanup()
HEATING_RELAY_PIN = 24
COOLING_RELAY_PIN = None  # Set to BCM pin if an AC relay is available
GPIO.setmode(GPIO.BCM)
GPIO.setup(HEATING_RELAY_PIN, GPIO.OUT)
if COOLING_RELAY_PIN is not None:
    GPIO.setup(COOLING_RELAY_PIN, GPIO.OUT)

#REVERB_HOST = 'ws://192.168.1.100:8080'
REVERB_HOST = os.getenv('REVERB_HOST')
APP_KEY = os.getenv('APP_KEY')
CHANNEL_NAME = os.getenv('CHANNEL_NAME')
EVENT_NAME = os.getenv('EVENT_NAME')

def handle_exit(sig, frame):
    print("Stopping service — turning relay OFF")
    set_heating_relay(False)
    set_cooling_relay(False)
    GPIO.cleanup()
    sys.exit(0)

# Capture shutdown/stop signals
signal.signal(signal.SIGTERM, handle_exit)
signal.signal(signal.SIGINT, handle_exit)

heating_on = False
cooling_on = False
TOLERANCE = 0.2

API_ENDPOINT = os.getenv('API_ENDPOINT')

Headers = { "Authorization" : os.getenv('API_TOKEN') }

previous_control_data = {}

def send_state(data):
    try:
        response = requests.post(url=f'{API_ENDPOINT}/state', headers=Headers, json=data, timeout=5)
        if not response.ok:
            print(f"Warning: send_state returned {response.status_code}: {response.text}")
    except requests.RequestException as exc:
        print(f"Warning: failed to send state update: {exc}")

def set_heating_relay(on):
    GPIO.output(HEATING_RELAY_PIN, GPIO.HIGH if on else GPIO.LOW)
    print(f'set_heating_relay:{on}')

# Placeholder for future air conditioning relay control
def set_cooling_relay(on):
    if COOLING_RELAY_PIN is not None:
        GPIO.output(COOLING_RELAY_PIN, GPIO.HIGH if on else GPIO.LOW)
    print(f'set_cooling_relay:{on}{"" if COOLING_RELAY_PIN is not None else " (placeholder)"}')


def process_hvac_control(home_data):
    global heating_on, cooling_on
    
    # 1. Extract Data
    temp = home_data.get('temperature')
    set_temp = home_data.get('set_temp')
    hvac_until = home_data.get('hvac_until') or 0
    mode = home_data.get('mode')
    
    current_ts = int(time.time())

    # 2. Safety Check (Crucial)
    if temp is None or set_temp is None or not (10 < temp < 50):
        print(f"Safety: Invalid temperature value or target setpoint. Turning OFF.")
        if heating_on:
            heating_on = False
            set_heating_relay(False)
        if cooling_on:
            cooling_on = False
            set_cooling_relay(False)
        send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })
        return

    # 3. Decision Logic
    if mode == 'cooling':
        if heating_on:
            heating_on = False
            set_heating_relay(False)

        should_cool = (temp >= (set_temp + TOLERANCE) or hvac_until > current_ts)
        should_stop = (temp <= (set_temp - TOLERANCE) and -1 < hvac_until < current_ts)

        if should_cool and not cooling_on:
            cooling_on = True
            print(f"ACTION: Temp {temp}°C is above target {set_temp}°C or BOOST active. Cooling ON.")
            set_cooling_relay(True)
            send_state({ 'heating_on': 0, 'cooling_on': 1, 'hvac_until': hvac_until })

        elif should_stop and cooling_on:
            cooling_on = False
            print(f"ACTION: Temp {temp}°C is below target {set_temp}°C and BOOST expired. Cooling OFF.")
            set_cooling_relay(False)
            send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })

        else:
            print(f"IDLE: Temp {temp}°C. Cooling is {'ON' if cooling_on else 'OFF'}.")

    elif mode == 'heating':
        if cooling_on:
            cooling_on = False
            set_cooling_relay(False)

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

    else:
        if heating_on or cooling_on:
            print(f"MODE UNKNOWN: {mode}. Shutting all HVAC outputs off.")
            heating_on = False
            cooling_on = False
            set_heating_relay(False)
            set_cooling_relay(False)
            send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })
        else:
            print(f"MODE UNKNOWN: {mode}. HVAC remains OFF.")


# --- WebSocket Client Functions ---

def on_open(ws):
    print("WebSocket connection opened. Subscribing to channel...")
    
    # The JSON message required to subscribe to a public channel via Pusher protocol
    subscribe_msg = json.dumps({
        "event": "pusher:subscribe",
        "data": {
            "channel": CHANNEL_NAME 
        }
    })
    ws.send(subscribe_msg)

def on_message(ws, message):
    """Called every time the Laravel app broadcasts an event."""
    global previous_control_data
    try:
        data = json.loads(message)

        if data.get('event') == EVENT_NAME:
            print(f"\n--- RECEIVED {EVENT_NAME} EVENT ---")
            
            event_data = json.loads(data['data'])
                
            current_control_data = event_data.get('reading') 
            
            if current_control_data is None:
                print("Event received, but missing 'reading' data.")
                return

            if current_control_data != previous_control_data:
                print(f"\n--- RECEIVED NEW DATA ---")
                
                previous_control_data = current_control_data
                
                process_hvac_control(current_control_data)
                
            else:
                print("IDLE: Event received, but control parameters unchanged. Skipping processing.")

        elif data.get('event') == 'pusher:connection_established':
             print("Subscription successful! Listening for updates...")
             
    except Exception as e:
        print(f"Error processing message: {e}")

def on_error(ws, error):
    print(f"WebSocket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("WebSocket connection closed. Retrying in 5 seconds...")
    time.sleep(5)
    start_websocket_client() 

# --- Main Execution ---
def start_websocket_client():
    ws_url = f"{REVERB_HOST}/app/{APP_KEY}?protocol=7&client=js&version=7.0.6"
    
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    # ws.run_forever() is blocking, use in a separate thread if you need other background tasks
    ws.run_forever(ping_interval=30, ping_timeout=10)


if __name__ == '__main__':
    try:
        print("Starting Pi Heater Controller via WebSockets...")
        # Optional: Clean up state on startup
        send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })
        start_websocket_client()
        
    except Exception as e:
        print(f"Fatal script error: {e}")
        handle_exit(None, None)
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

# Globális változóban tároljuk a megtalált és párosított klímákat,
# hogy ne kelljen minden hőmérséklet-állításnál újra szkennelni.


load_dotenv()     

# Setup GPIO
GPIO.cleanup()
HEATING_RELAY_PIN = 24
# COOLING_RELAY_PIN = None <-- Ezt kivehetjük, mert API-t használunk
GPIO.setmode(GPIO.BCM)
GPIO.setup(HEATING_RELAY_PIN, GPIO.OUT)

REVERB_HOST = os.getenv('REVERB_HOST')
APP_KEY = os.getenv('APP_KEY')
CHANNEL_NAME = os.getenv('CHANNEL_NAME')
EVENT_NAME = os.getenv('EVENT_NAME')

GREE_DEVICES = {}

# Kliensek beolvasása .env-ből
GREE_CORRIDOR_NAME = os.getenv('GREE_CORRIDOR_NAME')
GREE_CORRIDOR_IP = os.getenv('GREE_CORRIDOR_IP')
GREE_CORRIDOR_MAC = os.getenv('GREE_CORRIDOR_MAC')
GREE_BEDROOM_NAME = os.getenv('GREE_BEDROOM_NAME')
GREE_BEDROOM_IP = os.getenv('GREE_BEDROOM_IP')
GREE_BEDROOM_MAC = os.getenv('GREE_BEDROOM_MAC')

NTFY_TOPIC = os.getenv('NTFY_TOPIC')

def handle_exit(sig, frame):
    print("Stopping service — turning relay OFF")
    set_heating_relay(False)
    set_cooling_relay(False, 30) # Ez most már a klímákat kapcsolja ki
    GPIO.cleanup()
    sys.exit(0)

def graceful_shutdown(sig, frame):
    """Ezt a függvényt hívja meg a rendszer, ha megnyomod a Ctrl+C-t"""
    print("\n\n[!] Kézi leállítás (Ctrl+C) érzékelve!")
    print("Rendszer biztonságos lekapcsolása folyamatban...")
    
    try:
        # Ha létezik a WebSocket, kulturáltan bontjuk a kapcsolatot
        if 'ws' in globals():
            print(" - WebSocket kapcsolat bontása...")
            ws.close()
    except Exception as e:
        print(f"Hiba a WS bontásakor: {e}")
        
    try:
        # BIZTONSÁG: Minden GPIO relé elengedése!
        # Így nem marad bekapcsolva sem a fűtés, sem a hűtés, ha leáll a script.
        handle_exit(None, None)
        print(" - GPIO kimenetek alaphelyzetbe állítása...")
        GPIO.cleanup()
    except Exception as e:
        print(f"Hiba a GPIO takarításkor: {e}")
        
    print("Kilépés. További szép napot!")
    import os
    os._exit(0)

signal.signal(signal.SIGTERM, graceful_shutdown)
signal.signal(signal.SIGINT, graceful_shutdown)

heating_on = False
cooling_on = False
TOLERANCE = 0.2

API_ENDPOINT = os.getenv('API_ENDPOINT')
Headers = { "Authorization" : os.getenv('API_TOKEN') }
previous_control_data = {}

def send_ntfy_alert(message, tag):
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
        send_ntfy_alert(f"Failed to send state update: {exc}", "warning")

def set_heating_relay(on):
    GPIO.output(HEATING_RELAY_PIN, GPIO.HIGH if on else GPIO.LOW)
    print(f'set_heating_relay:{on}')

# --- ÚJ GREE KLÍMA VEZÉRLŐ RÉSZ ---

async def init_gree_ac():
    """Ez a függvény indításkor egyszer lefut, felkutatja és párosítja a klímákat."""
    global GREE_DEVICES
    print("Klíma hálózat szkennelése és párosítása indításkor...")
    
    discovery = Discovery()
    # 5 mp-ig hallgatunk a hálózaton
    devices = await discovery.scan(wait_for=5)
    
    for device_info in devices:
        try:
            device = Device(device_info)
            await device.bind() # Ekkor csinálja meg a V1/V2 tesztet és szedi le a kulcsot
            
            # Eltároljuk az objektumot a MAC címe (vagy IP-je) alapján
            GREE_DEVICES[device_info.ip] = device
            print(f"Klíma sikeresen párosítva! IP: {device_info.ip}, Mac: {device_info.mac}")
            
        except Exception as e:
            print(f"Hiba a {device_info.ip} klíma párosításakor: {e}")
            send_ntfy_alert(f"Hiba a {device_info.ip} klíma párosításakor: {e}", "warning")

async def send_gree_command(ip, power_on, target_temp):
    print(f"send_gree_command: IP={ip}, Power={power_on}, TargetTemp={target_temp}")
    global GREE_DEVICES
    
    # Kikeressük az indításkor párosított klímát
    device = GREE_DEVICES.get(ip)
    
    if not device:
         print(f"Nem tudok parancsot küldeni a {ip} címre, mert nincs a hálózaton vagy nem párosított.")
         return

    try:
        # Frissítjük az állapotot, mielőtt állítanánk rajta
        await asyncio.wait_for(device.update_state(), timeout=5.0)
        
        device.power = power_on
        if power_on:
            device.target_temperature = int(target_temp)
            device.mode = 1 # Hűtés
            device.fan_speed = 0 # Auto
        
        # Parancs kiküldése
        await asyncio.wait_for(device.push_state_update(), timeout=5.0)
        print(f"Gree parancs sikeres ({ip}): Power={power_on}, Temp={target_temp}")
        
    except Exception as e:
         print(f"Gree parancs hiba ({ip}): {e}")
         send_ntfy_alert(f"Gree parancs hiba ({ip}): {e}", "warning")

def set_cooling_relay(on, target_temp):
    """Szinkron wrapper az aszinkron Gree parancshoz."""
    # Ha több klímád is van a .env-ben, itt mindkettőnek elküldöd
    if GREE_CORRIDOR_IP:
        asyncio.run(send_gree_command(GREE_CORRIDOR_IP, on, target_temp))
    if GREE_BEDROOM_IP:
        asyncio.run(send_gree_command(GREE_BEDROOM_IP, on, target_temp))

def process_hvac_control(home_data):
    global heating_on, cooling_on
    
    temp = home_data.get('temperature')
    set_temp = home_data.get('set_temp')
    hvac_until = home_data.get('hvac_until') or 0
    mode = home_data.get('mode')
    current_ts = int(time.time())

    # Biztonsági ellenőrzés marad
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

    if mode == 'cooling':
        # Ha fűtés ment előtte, azt leállítjuk
        if heating_on:
            heating_on = False
            set_heating_relay(False)

        # OKOSÍTÁS: Nem kapcsolgatjuk ki-be a teljesítményt a TOLERANCE alapján.
        # Ha a mód 'cooling', a klímának mennie kell.
        if not cooling_on:
            cooling_on = True
            print(f"ACTION: Hűtés üzemmód aktív. Klímák bekapcsolása. Cél: {set_temp}°C")
            set_cooling_relay(True, set_temp)
            send_state({ 'heating_on': 0, 'cooling_on': 1, 'hvac_until': hvac_until })
        
        # Ha változott a célhőmérséklet a Laravelben, frissítjük a klímát is, 
        # de nem kapcsoljuk ki a gépet.
        elif previous_control_data.get('set_temp') != set_temp:
            print(f"ACTION: Célhőmérséklet módosult: {set_temp}°C. Klímák frissítése.")
            set_cooling_relay(True, set_temp)

    elif mode == 'heating':
        # A fűtés (mivel az valószínűleg egy sima relés kazán) maradhat hiszterézis alapon
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

    elif mode == 'off' or mode is None:
        if cooling_on or heating_on:
            print("ACTION: Rendszer lekapcsolása (OFF mód).")
            cooling_on = False
            heating_on = False
            set_cooling_relay(False, 30) # Klímák kikapcsolása
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
    except Exception as e:
        print(f"Error processing message: {e}")
        send_ntfy_alert(f"Error processing WebSocket message: {e}", "warning")

def on_error(ws, error):
    print(f"WebSocket Error: {error}")
    send_ntfy_alert(f"WebSocket Error: {error}", "warning")

def on_close(ws, close_status_code, close_msg):
    print("WebSocket connection closed. Retrying in 5 seconds...")
    time.sleep(5)
    start_websocket_client() 

def start_websocket_client():
    ws_url = f"{REVERB_HOST}/app/{APP_KEY}?protocol=7&client=js&version=7.0.6"
    ws = websocket.WebSocketApp(
        ws_url,
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close
    )
    ws.run_forever(ping_interval=30, ping_timeout=10)

if __name__ == '__main__':
    try:
        print("Starting Pi Heater/AC Controller via WebSockets...")
        send_state({ 'heating_on': 0, 'cooling_on': 0, 'hvac_until': 0 })

        print("Initializing Gree AC devices...")
        asyncio.run(init_gree_ac())

        start_websocket_client()
    except Exception as e:
        print(f"Fatal script error: {e}")
        send_ntfy_alert(f"Fatal script error: {e}", "warning")
        handle_exit(None, None)
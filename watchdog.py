import subprocess
import time
import requests
import os

# Configuration
NTFY_TOPIC = os.getenv("NTFY_TOPIC")
CHECK_INTERVAL = 60  # seconds
NOTIFY_COOLDOWN = 3600 # 1 hour - don't spam the same error
CRITICAL_CONTAINERS = ["myhome-redis", "myhome-laravel", "nextjs-frontend"]
...

# Track last notification time per container and error type
last_notifications = {}

def send_ntfy(message, tags="warning,docker", key=None):
    if not NTFY_TOPIC:
        print(f"NTFY_TOPIC not set. Suppressing alert: {message}")
        return

    current_time = time.time()
    
    # Anti-spam check
    if key:
        if key in last_notifications and (current_time - last_notifications[key]) < NOTIFY_COOLDOWN:
            return
        last_notifications[key] = current_time

    try:
        requests.post(f"https://ntfy.sh/{NTFY_TOPIC}", 
                      data=message.encode('utf-8'),
                      headers={
                          "Title": "Infrastructure Alert",
                          "Priority": "high",
                          "Tags": tags
                      })
    except Exception as e:
        print(f"Failed to send ntfy: {e}")

def check_containers():
    try:
        result = subprocess.check_output(["docker", "ps", "--format", "{{.Names}}:{{.Status}}"]).decode('utf-8')
        running_containers = dict(line.split(':', 1) for line in result.strip().split('\n') if ':' in line)
        
        # Track which containers we've seen this round to clear "resolved" states
        current_errors = set()

        for name in CRITICAL_CONTAINERS:
            if name not in running_containers:
                error_key = f"{name}_down"
                send_ntfy(f"CRITICAL: Container {name} is NOT running!", "skull,error", key=error_key)
                current_errors.add(error_key)
            elif "restarting" in running_containers[name].lower():
                error_key = f"{name}_restarting"
                send_ntfy(f"WARNING: Container {name} is constantly restarting!", "arrows_counterclockwise,warning", key=error_key)
                current_errors.add(error_key)
        
        # Clear cooldown for errors that are no longer present (so they can alert again if they return)
        keys_to_clear = [k for k in last_notifications if k not in current_errors]
        for k in keys_to_clear:
            del last_notifications[k]
                
    except Exception as e:
        send_ntfy(f"Watchdog Error: Could not check Docker status: {e}", "grey_question", key="docker_ps_error")

if __name__ == "__main__":
    print(f"Starting MyHome Watchdog... monitoring: {', '.join(CRITICAL_CONTAINERS)}")
    while True:
        check_containers()
        time.sleep(CHECK_INTERVAL)

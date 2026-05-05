#!/usr/bin/env python
import asyncio
from greeclimate.discovery import Discovery

async def find_ac():
    discovery = Discovery()
    devices = await discovery.scan(wait_for=5)
    for device in devices:
        try:
            print(f"AC found: {device.name} - IP: {device.ip} - MAC: {device.mac} - Port: {device.port}")
            device = Device(device_info)
            await device.bind() # Device will auto bind on update if you omit this step
        except CannotConnect:
            _LOGGER.error("Unable to bind to gree device: %s", device_info)
            continue

asyncio.run(find_ac())
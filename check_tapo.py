#!/usr/bin/env python
"""
Work out why the Pi cannot see a Tapo plug.

Run it on the Pi, in the same directory as the .env temp.py uses:

    python3 check_tapo.py            # broadcast discovery
    python3 check_tapo.py 192.168.1.80   # ask one address directly

Each stage is reported separately, because "no plugs found" has several
quite different causes and they need different fixes.
"""
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

EMAIL = os.getenv('TAPO_EMAIL')
PASSWORD = os.getenv('TAPO_PASSWORD')


def describe(device):
    """Everything temp.py needs from a device, and whether it is there."""
    print(f"    alias   : {getattr(device, 'alias', None)!r}")
    print(f"    host    : {getattr(device, 'host', None)!r}")
    print(f"    mac     : {getattr(device, 'mac', None)!r}")
    print(f"    model   : {getattr(device, 'model', None)!r}")

    modules = getattr(device, 'modules', None)
    if modules is None:
        print("    modules : none — this build has no module system")
        return

    try:
        names = sorted(str(key) for key in modules.keys())
    except Exception as exc:
        names = f'<could not list: {exc}>'
    print(f"    modules : {names}")

    energy = None
    try:
        import kasa
        key = getattr(getattr(kasa, 'Module', None), 'Energy', 'Energy')
        energy = modules.get(key) or modules.get('Energy')
    except Exception as exc:
        print(f"    energy  : lookup failed: {exc}")

    if energy is None:
        print("    energy  : NOT PRESENT — this device reports no metering")
        return

    for attribute in ('current_consumption', 'power', 'consumption_today', 'energy_today'):
        if hasattr(energy, attribute):
            print(f"    energy.{attribute} = {getattr(energy, attribute)!r}")


async def main():
    import kasa

    print(f"python-kasa {getattr(kasa, '__version__', '?')}")
    print(f"TAPO_EMAIL set: {bool(EMAIL)}   TAPO_PASSWORD set: {bool(PASSWORD)}")

    if not (EMAIL and PASSWORD):
        print("\nBoth must be set in .env, or temp.py never starts the plug thread.")
        return

    credentials = kasa.Credentials(EMAIL, PASSWORD)
    host = sys.argv[1] if len(sys.argv) > 1 else None

    if host:
        print(f"\nAsking {host} directly...")
        try:
            device = await kasa.Discover.discover_single(host, credentials=credentials)
        except Exception as exc:
            print(f"  FAILED: {type(exc).__name__}: {exc}")
            print("  Wrong address, or the credentials were rejected.")
            return
        found = {host: device}
    else:
        print("\nBroadcasting for devices (5s)...")
        try:
            found = await kasa.Discover.discover(credentials=credentials, discovery_timeout=5)
        except Exception as exc:
            print(f"  FAILED: {type(exc).__name__}: {exc}")
            return

    print(f"  {len(found)} device(s) answered.")

    if not found:
        print("""
  Nothing answered the broadcast. Usually one of:
    - the plug is on a different subnet or VLAN from the Pi
    - the access point has client isolation on, so broadcast never arrives
    - the Pi is on ethernet and the plug on a guest wifi network
  Try the direct form with the plug's address:  python3 check_tapo.py <ip>""")
        return

    for address, device in found.items():
        print(f"\n  {address}")
        try:
            await device.update()
        except Exception as exc:
            print(f"    update() FAILED: {type(exc).__name__}: {exc}")
            print("    Discovery found it but could not log in — check the account details.")
            continue
        describe(device)


if __name__ == '__main__':
    asyncio.run(main())

#!/usr/bin/env python
"""
Try libraries other than python-kasa against the plug.

python-kasa refuses this plug's TPAP encryption scheme. Other Tapo libraries
implement the protocol independently and have at times supported newer devices
first, so it is worth asking each of them directly before concluding the plug
cannot be read at all.

    pip install tapo plugp100
    python3 check_tapo_alt.py 192.168.1.8

Each library is optional: a missing one is reported and skipped. The APIs below
are written from their documented interfaces and may have moved, so treat an
AttributeError as "look at that library's docs", not as "the plug refused".
"""
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

EMAIL = os.getenv('TAPO_EMAIL')
PASSWORD = os.getenv('TAPO_PASSWORD')


def missing(package, exc):
    """
    Tell "the package is absent" apart from "its API has moved".

    Reporting the second as the first sends you off to install something that
    is already there, which is exactly the wrong direction.
    """
    import importlib.util

    if importlib.util.find_spec(package) is None:
        return f'not installed  (pip install {package})'

    return f'INSTALLED but the import failed — its API has moved: {exc}'


async def try_tapo(host):
    """mihai-dinculescu/tapo — Rust core with Python bindings."""
    try:
        from tapo import ApiClient
    except Exception as exc:
        return missing('tapo', exc)

    client = ApiClient(EMAIL, PASSWORD)
    attempts = []

    # A P110 answers p110(); the others are here in case the plug identifies
    # as something else. Every failure is reported: they are not all the same.
    for accessor in ('p110', 'p115', 'p100'):
        factory = getattr(client, accessor, None)
        if factory is None:
            attempts.append(f'{accessor}(): not offered by this version')
            continue

        try:
            device = await factory(host)
            info = await device.get_device_info()
            line = f'CONNECTED via {accessor}(): {getattr(info, "model", "?")}'

            usage = await device.get_energy_usage()
            power = getattr(usage, 'current_power', None)
            today = getattr(usage, 'today_energy', None)
            return f'{line}\n        current_power={power!r} (mW)  today_energy={today!r} (Wh)'
        except Exception as exc:
            attempts.append(f'{accessor}(): {type(exc).__name__}: {exc}')

    return 'failed\n' + '\n'.join(f'        {line}' for line in attempts)


async def try_plugp100(host):
    """petretiandrea/plugp100."""
    try:
        from plugp100.common.credentials import AuthCredential
        from plugp100.new.device_factory import DeviceConnectConfiguration, connect
    except Exception as exc:
        return missing('plugp100', exc)

    try:
        device = await connect(DeviceConnectConfiguration(
            host=host,
            credentials=AuthCredential(EMAIL, PASSWORD),
        ))
        await device.update()

        return (f'CONNECTED: {getattr(device, "model", "?")}  '
                f'mac={getattr(device, "mac", "?")}  '
                f'energy={getattr(device, "energy_info", None)!r}')
    except Exception as exc:
        return f'failed  ({type(exc).__name__}: {exc})'


async def main():
    host = sys.argv[1] if len(sys.argv) > 1 else None

    if not host:
        print(__doc__)
        return

    if not (EMAIL and PASSWORD):
        print('TAPO_EMAIL and TAPO_PASSWORD must be set in .env.')
        return

    # Shape only, never the values. A stray space inside the quotes in .env
    # survives loading and produces an authentication failure that looks
    # exactly like a wrong password.
    for label, value in (('email', EMAIL), ('password', PASSWORD)):
        flags = []
        if value != value.strip():
            flags.append('HAS LEADING/TRAILING WHITESPACE')
        if label == 'email' and value != value.lower():
            flags.append('not all lower case')
        print(f'  {label:9} {len(value)} chars  {" ".join(flags)}')

    print(f'\nAsking {host} with each library in turn.\n')

    for name, attempt in (('tapo', try_tapo), ('plugp100', try_plugp100)):
        try:
            result = await attempt(host)
        except Exception as exc:
            result = f'raised {type(exc).__name__}: {exc}'
        print(f'  {name:10} {result}\n')

    print('Any line saying CONNECTED means that library can read the plug, and\n'
          'temp.py can be pointed at it instead of python-kasa.')


if __name__ == '__main__':
    asyncio.run(main())

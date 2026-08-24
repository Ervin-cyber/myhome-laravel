#!/usr/bin/env python
"""
Ask a Gree whether it will hold a half-degree setpoint while set to Celsius.

    python3 check_half_degree.py                 # every unit found
    python3 check_half_degree.py 192.168.1.51    # just this one

A Gree does not store Fahrenheit. It stores an integer Celsius in SetTem and a
half-degree flag in TemRec, and Fahrenheit is only how greeclimate chooses to
expose the pair -- its setter writes TemRec exclusively in Fahrenheit mode, and
_convert_to_units discards it on read in Celsius mode.

So the question this answers is not "does the protocol have half degrees" -- it
plainly does -- but "will this unit keep the flag when nothing has switched it
to Fahrenheit". If it does, we get 0.5C steps and the wall display stays in
Celsius. If it does not, the only route to 26.5 is putting the whole house in
Fahrenheit, and that is a different conversation.

Changes nothing permanently: the original setpoint, flag and units are put back
before it exits, including on Ctrl-C. It does not touch power or mode, so a
running unit keeps running.
"""
import asyncio
import logging
import sys

from greeclimate.device import Device, Props
from greeclimate.discovery import Discovery

# Long enough for the unit to have acted, short enough to wait through.
SETTLE_SECONDS = 3

# update_state() can return before the unit's reply has actually landed -- the
# first run of this printed None for every field while the packet carrying them
# was still in flight. So ask, then wait for the answer to turn up.
READ_ATTEMPTS = 6


def describe(device):
    """The three fields this is about, straight off the raw properties."""
    return {
        'SetTem': device.get_property(Props.TEMP_SET),
        'TemRec': device.get_property(Props.TEMP_BIT),
        'TemUn': device.get_property(Props.TEMP_UNIT),
    }


async def read_state(device):
    """
    Refresh until the unit has actually said something.

    Returns the fields once SetTem is present, or whatever we have after the
    last attempt -- a unit that never answers is a real result, not a hang.
    """
    for attempt in range(READ_ATTEMPTS):
        try:
            await asyncio.wait_for(device.update_state(), timeout=5.0)
        except Exception as exc:
            print(f"  read attempt {attempt + 1}: {type(exc).__name__}")

        await asyncio.sleep(0.7)

        state = describe(device)
        if state['SetTem'] is not None:
            return state

    return describe(device)


async def probe(device, label):
    before = await read_state(device)
    print(f"\n{label}")
    print(f"  now: SetTem={before['SetTem']}  TemRec={before['TemRec']}  "
          f"TemUn={before['TemUn']} ({'Fahrenheit' if before['TemUn'] == 1 else 'Celsius'})")

    if before['TemUn'] == 1:
        print("  already in Fahrenheit — this probe is about Celsius mode; skipping.")
        return

    if before['SetTem'] is None:
        print("  this unit reports no setpoint; skipping.")
        return

    # Ask for the same whole degree it already holds, plus the half. Keeping
    # SetTem unchanged is deliberate: if the unit moves, the flag is the only
    # thing that can have moved it.
    target = int(before['SetTem'])

    try:
        print(f"  asking for {target}.5 (SetTem={target}, TemRec=1) ...")
        device.set_property(Props.TEMP_SET, target)
        device.set_property(Props.TEMP_BIT, 1)
        await device.push_state_update()

        await asyncio.sleep(SETTLE_SECONDS)
        after = await read_state(device)

        print(f"  read back: SetTem={after['SetTem']}  TemRec={after['TemRec']}")

        if after['TemRec'] == 1 and after['SetTem'] == target:
            print(f"  => KEPT IT. This unit holds {target}.5 in Celsius mode.")
        elif after['TemRec'] in (0, None):
            print("  => DROPPED IT. The unit cleared the flag; Celsius is whole degrees here.")
        else:
            print("  => UNCLEAR. Neither kept nor cleared; worth reading the numbers above.")
    finally:
        # Back exactly as found, whatever happened above.
        device.set_property(Props.TEMP_SET, before['SetTem'])
        device.set_property(Props.TEMP_BIT, before['TemRec'] if before['TemRec'] is not None else 0)
        await device.push_state_update()
        print(f"  restored to SetTem={before['SetTem']}, TemRec={before['TemRec']}")


async def main():
    args = [a for a in sys.argv[1:] if a != '--verbose']

    # greeclimate logs every packet, key and cipher digest at DEBUG, which
    # buries the four numbers this is about. Pass --verbose to see it all.
    if '--verbose' not in sys.argv:
        logging.getLogger('greeclimate').setLevel(logging.WARNING)
        logging.getLogger('asyncio').setLevel(logging.WARNING)

    only = args[0] if args else None

    print("Scanning for units (5s)...")
    found = await Discovery().scan(wait_for=5)

    if only:
        found = [d for d in found if d.ip == only]

    if not found:
        print("No units answered." if not only else f"No unit at {only}.")
        return

    for info in found:
        device = Device(info)
        try:
            await device.bind()
        except Exception as exc:
            print(f"\n{info.ip}: could not pair ({type(exc).__name__}: {exc})")
            continue

        try:
            await probe(device, f"{info.name} at {info.ip}")
        except Exception as exc:
            print(f"  probe failed: {type(exc).__name__}: {exc}")

    print("\nIf a unit kept the flag, half-degree setpoints work without touching\n"
          "the display units, and that is the version worth building.")


if __name__ == '__main__':
    asyncio.run(main())

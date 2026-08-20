export interface User {
    uid: string;
    email: string;
}

export type Mode = 'heating' | 'cooling';

export type TempSource = 'sensor' | 'ac' | 'none';
export type HeatSource = 'boiler' | 'ac' | 'none';

/**
 * Heating vs cooling is decided once for the whole house so rooms can never
 * fight each other. Dry and fan are comfort choices that make sense in any
 * season, so a room may opt into one. Null follows the house.
 */
export type ModeOverride = 'dry' | 'fan' | null;

export type FanSpeed = 'auto' | 'low' | 'medium_low' | 'medium' | 'medium_high' | 'high';

export const FAN_SPEEDS: { value: FanSpeed; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'low', label: 'Low' },
    { value: 'medium_low', label: 'Med-Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'medium_high', label: 'Med-High' },
    { value: 'high', label: 'High' },
];

export type SwingVertical = 'off' | 'full' | 'fixed_upper' | 'fixed_middle_up' | 'fixed_middle' | 'fixed_middle_low' | 'fixed_lower';
export type SwingHorizontal = 'off' | 'full' | 'fixed_left' | 'fixed_middle_left' | 'fixed_middle' | 'fixed_middle_right' | 'fixed_right';

export const SWING_VERTICAL: { value: SwingVertical; label: string }[] = [
    { value: 'off', label: 'Fixed' },
    { value: 'full', label: 'Swing' },
    { value: 'fixed_upper', label: 'Up' },
    { value: 'fixed_middle_up', label: 'Up-Mid' },
    { value: 'fixed_middle', label: 'Middle' },
    { value: 'fixed_middle_low', label: 'Low-Mid' },
    { value: 'fixed_lower', label: 'Down' },
];

export const SWING_HORIZONTAL: { value: SwingHorizontal; label: string }[] = [
    { value: 'off', label: 'Fixed' },
    { value: 'full', label: 'Swing' },
    { value: 'fixed_left', label: 'Left' },
    { value: 'fixed_middle_left', label: 'Mid-Left' },
    { value: 'fixed_middle', label: 'Centre' },
    { value: 'fixed_middle_right', label: 'Mid-Right' },
    { value: 'fixed_right', label: 'Right' },
];

/**
 * Why the control loop is holding a unit off, in its own words.
 *
 * Written by the API where the decision is made. The dashboard renders it and
 * never re-derives it: working out the reason here would be a second copy of
 * the rules, free to drift from the one that actually decides.
 */
export type HoldReason =
    | 'cooling_down'
    | 'at_temperature'
    | 'room_off'
    | 'house_off'
    | 'parked'
    | 'remote'
    | 'radiators';

export const HOLD_LABELS: Record<HoldReason, string> = {
    cooling_down: 'Compressor protection',
    at_temperature: 'Room at temperature',
    room_off: 'Room off',
    house_off: 'House off',
    parked: 'Unit parked',
    remote: 'Off at the remote',
    radiators: 'Radiators heat this room',
};

/** The longer form, for the one place there is room to explain properly. */
export const HOLD_EXPLANATIONS: Record<HoldReason, string> = {
    cooling_down: 'Waiting before restarting — a compressor started straight after stopping wears out early.',
    at_temperature: 'The room is already past its target, so there is nothing for the unit to do.',
    room_off: 'This room is switched off. Its own power button starts it.',
    house_off: 'The house is switched off. The switch in the header starts it.',
    parked: 'This unit is set aside and will not run. Running the room brings it back.',
    remote: 'Somebody switched this unit off at the handset, and the app is leaving it alone.',
    radiators: 'This room is heated by radiators, so its unit stays idle in winter.',
};

/** The settings a person chooses, and so the ones that can be seen not to land. */
export type SettableField = 'fan_speed' | 'swing_vertical' | 'swing_horizontal' | 'xfan' | 'quiet' | 'turbo' | 'power_save';

/**
 * What the unit reports about itself, read straight off the hardware.
 *
 * Every field is nullable: a Gree answers with values this build may have no
 * name for, and inventing one would put a guess where the whole point is that
 * this is the one thing we did not make up.
 */
export interface ObservedState {
    power: boolean | null;
    mode: string | null;
    target_temp: number | null;
    fan_speed: FanSpeed | null;
    swing_v: SwingVertical | null;
    swing_h: SwingHorizontal | null;
    xfan: boolean | null;
    quiet: boolean | null;
    turbo: boolean | null;
    power_save: boolean | null;
}

export interface Room {
    id: number;
    name: string;
    slug: string;
    icon: string | null;
    sort_order: number;
    target_temp: number;
    enabled: boolean;
    /** Unix timestamp; 0 means no boost. Boost is per room. */
    hvac_until: number;
    is_boosting: boolean;
    temp_source: TempSource;
    sensor_device: string | null;
    calibration_offset: number;
    /** Rooms on 'boiler' share the single house relay. */
    heat_source: HeatSource;
    mode_override: ModeOverride;
    drives_boiler: boolean;
    current_temp: number | null;
    current_temp_at: string | null;
    heating_on: boolean;
    cooling_on: boolean;
    air_conditioners?: AirConditioner[];
}

export interface AirConditioner {
    id: number;
    room_id: number | null;
    name: string;
    ip: string;
    /** Stable identity across DHCP lease changes — this is what maps a unit to a room. */
    mac: string;
    port: number;
    target_temp: number;
    enabled: boolean;
    mode: string;
    /** Running at all. In fan mode a unit is powered while neither heating nor cooling. */
    power_on: boolean;
    /**
     * What the unit itself last said, or null if nobody has asked recently.
     * Only refreshed while a dashboard is open, so null is the resting state,
     * and it disagreeing with power_on is the one honest sign of a lost command.
     */
    observed_power: boolean | null;
    /** The unit's own account of itself. A null field means it said something we have no word for. */
    observed_state: ObservedState | null;
    observed_at: string | null;
    /** True while a command may still be travelling to the unit. */
    awaiting: boolean;
    /** Why the loop is holding this unit off, or null when nothing is. */
    hold_reason: HoldReason | null;
    /** Seconds until the compressor guard releases, or null when it is not holding. */
    cooling_down_for: number | null;
    /** Settings whose last command the unit did not take. Nothing retries them. */
    rejected: SettableField[];
    /**
     * True while somebody's own switching — handset or the Gree app — outranks
     * the thermostat for this unit. Cleared by any deliberate action in the app.
     */
    following_remote: boolean;
    manual_power: boolean | null;
    manual_since: string | null;
    fan_speed: FanSpeed;
    swing_vertical: SwingVertical;
    swing_horizontal: SwingHorizontal;
    /** Gree's own post-cooling coil dry, so the evaporator does not grow mould. */
    xfan: boolean;
    /** Mutually exclusive, and both override fan_speed at the unit. */
    quiet: boolean;
    turbo: boolean;
    /** Gree's SE mode: caps how hard the compressor may work. Excludes turbo. */
    power_save: boolean;
    heating_on: boolean;
    cooling_on: boolean;
    online: boolean;
    /** The unit's own indoor sensor. Shown as a secondary reading. */
    reported_temp: number | null;
    reported_at: string | null;
    calibration_offset: number;
    /** reported_temp with calibration_offset already applied. */
    calibrated_temp: number | null;
}

/**
 * What the draw says is running downstream of a plug. This is the only signal
 * in the system that reports what the hardware is actually doing rather than
 * what we last told it to do.
 */
export type PlugActivity = 'idle' | 'fan' | 'compressor' | 'unknown';

export interface SmartPlug {
    id: number;
    mac: string;
    name: string;
    ip: string | null;
    /** Null means the plug measures more than one room, so its total is house-wide. */
    room_id: number | null;
    online: boolean;
    last_seen_at: string | null;
    watts: number | null;
    watts_at: string | null;
    /** kWh so far today, as counted by the plug itself. */
    energy_today: number | null;
    activity: PlugActivity;
}

export interface ThermostatData {
    currentTemp: number;
    targetTemp: number;
    heating: boolean;
    cooling: boolean;
    mode: Mode;
    enabled: boolean;
    hvacUntil: number;
    lastUpdated: Date | null;
    airConditioners: AirConditioner[];
    rooms: Room[];
    smartPlugs: SmartPlug[];
}

export interface Stat {
    temp_min: number;
    temp_max: number;
    temp_avg: number;
    run_time: number;
    count_on: number;
}

export interface TemperatureResponse {
    value: number;
    timestamp: string;
    created_by?: number;
    updated_by?: number;
}
export interface SystemStateResponse {
    heating_on: boolean;
    cooling_on: boolean;
    mode: Mode;
    enabled: boolean;
    target_temp: number;
    hvac_until: number;
    timestamp?: string;
    air_conditioners?: AirConditioner[];
    rooms?: Room[];
    smart_plugs?: SmartPlug[];
}

export interface FetchLatestDataResponse {
    temp: TemperatureResponse | null;
    state: SystemStateResponse | null;
}

export interface LiveReadingEvent {
    reading: {
        temperature: number;
        last_updated: string;
        heating_on: boolean;
        cooling_on: boolean;
        mode: Mode;
        enabled: boolean;
        set_temp: number;
        hvac_until: number;
        air_conditioners: AirConditioner[];
        rooms: Room[];
        smart_plugs: SmartPlug[];
    }
}
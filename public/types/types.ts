export interface User {
    uid: string;
    email: string;
}

export type Mode = 'heating' | 'cooling';

export type TempSource = 'sensor' | 'ac' | 'none';
export type HeatSource = 'boiler' | 'ac' | 'none';

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
    }
}
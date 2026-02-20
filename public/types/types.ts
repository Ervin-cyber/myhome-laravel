export interface User {
    uid: string;
    email: string;
}

export interface ThermostatData {
    currentTemp: number;
    targetTemp: number;
    heating: boolean;
    heatingUntil: number;
    lastUpdated: Date | null;
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
    target_temp: number;
    heating_until: number;
    timestamp?: string;
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
        set_temp: number;
        heating_until: number;
    }
}
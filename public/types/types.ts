export type User = {
    uid: string;
    email: string;
}

export type Stat = {
    temp_min: number;
    temp_max: number;
    temp_avg: number;
    run_time: number;
    count_on: number;
}

export type SystemState = {
    heating_on: number;
    target_temp: number;
    heating_until: number;
}

export type UpdatePayload = {
    reading: {
        temperature: number;
        last_updated: string;
        heating_on: boolean;
        set_temp: number;
        heating_until: number;
    }
}
export interface StatCardProps {
    label: string;
    value: string | number;
    colorClass: string;
}

export interface TempGaugeProps {
    temp: number;
    target: number;
    isHeating: boolean;
}

export interface HeatingIconProps {//size = 32, isOn = true, className = '' 
    size: number;
    isOn: boolean;
    className?: string;
}
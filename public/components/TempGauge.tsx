import { TempGaugeProps } from "@/types/components";

export default function TempGauge({ temp, target, isHeating }: TempGaugeProps) {
    const percentage = Math.min(100, Math.max(0, ((temp - 10) / 21) * 100));
    const targetPercentage = Math.min(100, Math.max(0, ((target - 10) / 21) * 100));

    return (
        <div className="relative w-full h-4 bg-gray-700 rounded-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500 opacity-30" />
            <div className="absolute h-full bg-gradient-to-r from-blue-500 via-green-500 to-orange-500 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%`, boxShadow: isHeating ? '0 0 10px rgba(255,150,0,0.5)' : 'none' }} />
            <div className="absolute w-1 h-6 -top-1 bg-white rounded-full shadow-lg transition-all duration-300"
                style={{ left: `${targetPercentage}%`, transform: 'translateX(-50%)' }} />
        </div>
    );
}
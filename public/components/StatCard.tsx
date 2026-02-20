import { StatCardProps } from "@/types/components";

const StatCard = ({ label, value, colorClass }: StatCardProps) => (
    <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
        <p className="text-gray-500 text-xs uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-semibold ${colorClass}`}>{value}</p>
    </div>
);
export default StatCard;
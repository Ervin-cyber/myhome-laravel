import Dashboard from "../components/Dashboard";
import FloatingParticles from "../components/FloatingParticles";

export default function DashboardPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
            <FloatingParticles />
            <Dashboard />
        </div>
    )
}
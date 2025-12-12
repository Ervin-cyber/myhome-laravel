export default function LoadingSpinner() {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] space-y-4">
            <div className="relative w-16 h-16">
                {/* Background Circle */}
                <div className="absolute inset-0 border-4 border-gray-700/50 rounded-full"></div>

                {/* Spinning Gradient Circle */}
                <div className="absolute inset-0 border-4 border-t-orange-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>

                {/* Inner Pulse */}
                <div className="absolute inset-0 m-auto w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            </div>
            <p className="text-gray-400 text-sm font-medium animate-pulse">Connecting...</p>
        </div>
    );
}
"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from "react";

type NotificationType = "success" | "error" | "info" | null;

interface NotificationContextType {
  showNotification: (message: string, type: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Stable across renders. Consumers list it as a dependency, and a new
  // function on every render meant each toast re-ran their effects -- on the
  // dashboard, tearing down and restarting the polling and the live channel.
  const showNotification = useCallback((message: string, type: NotificationType) => {
    setNotification({ message, type });

    // A second toast gets its own three seconds, not what was left of the first.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setNotification(null);
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showNotification }), [showNotification]);

  const tone = notification?.type === 'success'
    ? 'bg-green-600/90 shadow-green-600/20'
    : notification?.type === 'info'
      ? 'bg-gray-700/90 shadow-gray-700/20'
      : 'bg-red-500/90 shadow-red-500/20';

  return (
    <NotificationContext.Provider value={value}>
      {children}

      <div className="fixed top-4 left-0 right-0 flex justify-center z-[100] pointer-events-none">
        {notification && (
          <div className={`${tone} backdrop-blur-md text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto`}>
            {notification.message}
          </div>
        )}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
}
"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type NotificationType = "success" | "error" | "info" | null;

interface NotificationContextType {
  showNotification: (message: string, type: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ message, type });
    
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      
      <div className="fixed top-4 left-0 right-0 flex justify-center z-[100] pointer-events-none">
        {notification && (
          <div className="bg-red-500/90 backdrop-blur-md text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/20 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto">
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
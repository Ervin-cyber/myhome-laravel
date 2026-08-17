import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v13-appRouter";
import FloatingParticles from "../components/FloatingParticles";
import { NotificationProvider } from "@/context/NotificationContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyHome",
  description: "Next.js Home Control App",
};

// The dashboard is used one-handed on a phone far more than on a desktop.
// viewport-fit lets the layout reach under the home indicator, which the
// safe-area padding in Dashboard then accounts for.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-[100dvh] w-full overflow-x-hidden bg-gray-900 antialiased`}
      ><AppRouterCacheProvider>
          <NotificationProvider>
            <FloatingParticles />
            {children}
          </NotificationProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

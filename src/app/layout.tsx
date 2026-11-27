import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { TopNavbar } from "@/components/layout/top-navbar";
import { GlobalCallOverlay } from "@/components/messaging/global-call-overlay";
import { AppUpdateModal } from "@/components/native/app-update-modal";
import { NativeInsetsSync } from "@/components/native/native-insets-sync";
import { NotificationToastViewport } from "@/components/notifications/notification-toast-viewport";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { GlobalErrorObserver } from "@/components/telemetry/global-error-observer";
import { AuthProvider } from "@/modules/auth/auth-provider";
import { VoiceCallProvider } from "@/modules/messaging/voice-call-provider";
import { NotificationsProvider } from "@/modules/notifications/notifications-provider";
import { AppearanceProvider } from "@/modules/theme/appearance-provider";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Codit — Programação, IA e Carreira Tech",
    template: "%s | Codit",
  },
  description:
    "Plataforma educacional e rede de estudos Mobile-First para aprender programação, criar projetos no Sandbox e colaborar com amigos.",
  applicationName: "Codit",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Codit",
  },
  icons: {
    icon: [
      { url: "/icons/octopy-mark.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6338f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="codit-app-shell bg-background text-foreground antialiased">
        <AuthProvider>
          <AppearanceProvider>
            <NotificationsProvider>
              <VoiceCallProvider>
                <div className="codit-app-content flex min-h-dvh flex-col">
                  <GlobalErrorObserver />
                  <NativeInsetsSync />
                  <ServiceWorkerRegister />
                  <TopNavbar />
                  <OfflineBanner />
                  <AppUpdateModal />
                  <NotificationToastViewport />
                  <GlobalCallOverlay />
                  <div className="codit-safe-x codit-mobile-nav-clearance flex-1">
                    {children}
                  </div>
                </div>
              </VoiceCallProvider>
            </NotificationsProvider>
          </AppearanceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { TopNavbar } from "@/components/layout/top-navbar";
import { AppUpdateModal } from "@/components/native/app-update-modal";
import { NativeInsetsSync } from "@/components/native/native-insets-sync";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { AuthProvider } from "@/modules/auth/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Codit — Programação, IA e Carreira Tech",
    template: "%s | Codit",
  },
  description:
    "Plataforma SaaS educacional Mobile-First e PWA para aprender programação, Inteligência Artificial, Git/GitHub e carreira tech com o tutor Octopy.",
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
    { media: "(prefers-color-scheme: light)", color: "#7c3aed" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a16" },
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
    <html lang="pt-BR">
      <body className="codit-app-shell flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <AuthProvider>
          <NativeInsetsSync />
          <ServiceWorkerRegister />
          <TopNavbar />
          <OfflineBanner />
          <AppUpdateModal />
          <div className="codit-safe-x codit-mobile-nav-clearance flex-1">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}

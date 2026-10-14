import type { Metadata, Viewport } from "next";
import { APP } from "@/config";
import { PwaRegister } from "@/components/PwaRegister";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
  applicationName: APP.name,
  appleWebApp: { capable: true, title: APP.name, statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#6c47ff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Bare document. The app shell (sidebar, data) lives in (main)/layout.tsx so /login and /offline leak nothing. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {children}
        <PwaRegister label={t("pwa.install")} />
      </body>
    </html>
  );
}

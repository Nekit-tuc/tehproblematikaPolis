import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata = {
  title: "Polissya Service Desk AI",
  description: "Система технічних заявок Полісся Продукт",
  manifest: "/manifest.json",
  themeColor: "#ff7a18",
  appleWebApp: {
    capable: true,
    title: "Service Desk",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#090909",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className="dark">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polissya Service Desk",
  description: "Внутрішня система керування технічними заявками",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uk" className="dark">
      <body>{children}</body>
    </html>
  );
}

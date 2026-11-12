import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Truhenzähler", description: "Clan-Truhen für Total Battle zählen und auswerten", robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f172a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}

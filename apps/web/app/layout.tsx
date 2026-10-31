import type { Metadata, Viewport } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Web IDE",
  description: "A modular, embeddable browser IDE.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#181818" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

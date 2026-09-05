import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "roamr",
  description: "Brag about touching grass to only your friends.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app is opened on phones far more than on desktop, so the theme colour
  // is worth setting for both schemes rather than leaving the browser chrome
  // to guess.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfcf9" },
    { media: "(prefers-color-scheme: dark)", color: "#14140f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh antialiased">{children}</body>
    </html>
  );
}

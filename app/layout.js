import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppLanguageProvider } from "./i18n-provider";
import PwaRegister from "./components/pwa-register";
import LandscapeGuard from "./components/landscape-guard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "frets.dev",
    template: "%s | frets.dev",
  },
  description:
    "Open source fretboard training tools. Practice note recognition with voice, metronome sync, and waveform feedback.",
  applicationName: "frets.dev",
  keywords: [
    "fretboard",
    "guitar",
    "music trainer",
    "note generator",
    "ear training",
    "open source",
  ],
  openGraph: {
    title: "frets.dev",
    description:
      "Open source fretboard training tools with note generation, metronome control, and voice guidance.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "frets.dev",
    description:
      "Open source fretboard training tools with note generation, metronome control, and voice guidance.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "frets.dev",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icons/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icons/icon-192.svg"],
  },
};

export const viewport = {
  themeColor: "#090c14",
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppLanguageProvider>{children}</AppLanguageProvider>
        <LandscapeGuard />
        <PwaRegister />
      </body>
    </html>
  );
}

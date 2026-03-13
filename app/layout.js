import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

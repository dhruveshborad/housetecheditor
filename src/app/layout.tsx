import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "SyncForge — Local-First Collaborative Document Editor",
    template: "%s | SyncForge",
  },
  description:
    "SyncForge is a production-grade, offline-first collaborative document editor featuring deterministic Lamport clock conflict resolution, version history time-travel, real-time collaboration, and a background sync engine. Built with Next.js 16, React 19, PostgreSQL, and Socket.IO.",
  keywords: [
    "collaborative editor",
    "offline-first",
    "real-time collaboration",
    "local-first",
    "document editor",
    "CRDT",
    "Lamport clock",
    "Next.js",
    "SyncForge",
  ],
  authors: [{ name: "SyncForge Team" }],
  openGraph: {
    title: "SyncForge — Local-First Collaborative Document Editor",
    description:
      "Type instantly offline, resolve conflicts deterministically, and collaborate in real-time with granular version control.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "SyncForge — Local-First Collaborative Document Editor",
    description:
      "Offline-first collaborative editing with deterministic conflict resolution and real-time sync.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}


import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * `next/font/google` downloads these at BUILD time and self-hosts them from our
 * own origin — there is no runtime request to fonts.gstatic.com. That matters
 * here: COEP `require-corp` (FR-7) blocks cross-origin subresources that do not
 * opt in via CORP, so a hand-rolled <link> to Google Fonts would break the page.
 * Any future font or third-party asset must be self-hosted or CORP-enabled.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChessCoach AI — post-game chess coaching",
  description:
    "Import your finished Lichess and chess.com games, analyze them with Stockfish in your browser, and get a plain-language explanation of what went wrong.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

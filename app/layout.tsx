import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./design-system.css";
import { ThemeProvider } from "./_components/theme-provider";
import { WebAnalytics } from "./_components/web-analytics";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Turas",
  description: "Vercel customer maturity journey",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body><ThemeProvider>{children}</ThemeProvider><WebAnalytics /></body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "./_components/theme-provider";
import { WebAnalytics } from "./_components/web-analytics";

export const metadata: Metadata = {
  title: "Turas",
  description: "Vercel customer maturity journey",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ThemeProvider>{children}</ThemeProvider><WebAnalytics /></body>
    </html>
  );
}

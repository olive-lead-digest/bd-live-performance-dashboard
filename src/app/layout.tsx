import type { Metadata } from "next";
import { DashboardProvider } from "@/lib/DashboardContext";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/AppShell"; // We will extract the shell layout to a client component to hold state

export const metadata: Metadata = {
  title: "Olive BD Dashboard",
  description: "Live Performance Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <Script src="/dashboard_data.js" strategy="beforeInteractive" />
      </head>
      <body className="antialiased min-h-screen">
        <DashboardProvider>
          <AppShell>{children}</AppShell>
        </DashboardProvider>
      </body >
    </html>
  );
}

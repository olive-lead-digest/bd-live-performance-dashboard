import type { Metadata } from "next";
import { DashboardProvider } from "@/lib/DashboardContext";
import "./globals.css";
import { AppShell } from "@/components/AppShell"; // We will extract the shell layout to a client component to hold state
import { getSessionProfile, roleLabel } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Olive BD Dashboard",
  description: "Live Performance Dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side from the httpOnly session cookie. Null on /login (no
  // session yet) and briefly on any page hit without a valid session — the
  // proxy (src/proxy.ts) is what actually enforces the redirect to /login;
  // this is just what renders the "Signed in as" chrome once authenticated.
  const session = await getSessionProfile();
  const user = session
    ? {
        fullName: session.profile.name,
        email: session.email,
        roleLabel: roleLabel(session.profile),
        isAdmin: session.profile.role === "admin",
      }
    : null;

  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-[100dvh]">
        <DashboardProvider>
          <AppShell user={user}>{children}</AppShell>
        </DashboardProvider>
      </body >
    </html>
  );
}

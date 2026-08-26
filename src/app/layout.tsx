import type { Metadata } from "next";
import { DashboardProvider } from "@/lib/DashboardContext";
import "./globals.css";
import { AppShell } from "@/components/AppShell"; // We will extract the shell layout to a client component to hold state
import { getSessionProfile, roleLabel } from "@/lib/auth";
import { getShareContext } from "@/lib/shareSession";

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

  // No session? The one other way in is a live public share link. A real
  // session ALWAYS wins, so this is only consulted when there isn't one. The
  // share chrome carries no identity — it is not a user, and isAdmin is hard
  // false so the Activity Log nav entry never renders for it (the /admin
  // routes are separately blocked in src/proxy.ts and by their own role
  // checks).
  const share = session ? null : await getShareContext();

  const user = session
    ? {
        fullName: session.profile.name,
        email: session.email,
        roleLabel: roleLabel(session.profile),
        isAdmin: session.profile.role === "admin",
        isShare: false,
      }
    : share
      ? {
          fullName: "Shared view",
          email: "",
          roleLabel: "Shared link · all regions",
          isAdmin: false,
          isShare: true,
        }
      : null;

  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-[100dvh]">
        <DashboardProvider>
          <AppShell user={user} isShare={!!share}>{children}</AppShell>
        </DashboardProvider>
      </body >
    </html>
  );
}

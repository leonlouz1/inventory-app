import { useUser } from "@clerk/clerk-react";

// Role is set per user in Clerk's public metadata, e.g. { "role": "designer" }.
// No role means full access. The backend enforces the same rules.
export function useRole() {
  const { user } = useUser();
  const role = String(user?.publicMetadata?.role || "admin").trim().toLowerCase();
  return { role, isDesigner: role === "designer" };
}

// Pages a designer can open; everything else redirects to the first one.
export const DESIGNER_PATHS = ["/products", "/catalog"];

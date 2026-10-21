const { verifyToken, clerkClient } = require("@clerk/express");

// Read-only catalog endpoints used by the public catalog site (no sign-in).
const PUBLIC_ROUTES = [
  { method: "GET", path: /^\/catalog\/?$/ },
  { method: "GET", path: /^\/catalog\/[^/]+\/?$/ },
  // Product images: <img> tags can't send a sign-in token, and the catalog site shows them
  { method: "GET", path: /^\/images\/\d+\/?$/ },
];

// What a "designer" may do: view and edit product details, and use the UPC
// page. No stock, orders, reports, deletes, or anything else.
const DESIGNER_ROUTES = [
  { method: "*", path: /^\/upc(\/|$)/ },
  { method: "GET", path: /^\/product-fields\/?$/ },
  { method: "POST", path: /^\/product-fields\/[^/]+\/options\/?$/ },
  { method: "GET", path: /^\/products\/?$/ },
  { method: "GET", path: /^\/products\/\d+\/full\/?$/ },
  { method: "GET", path: /^\/products\/by-sku\/[^/]+\/?$/ },
  { method: "GET", path: /^\/products\/details\/?$/ },
  { method: "POST", path: /^\/images\/?$/ },
  { method: "POST", path: /^\/products\/bulk-update\/?$/ },
  { method: "POST", path: /^\/products\/?$/ },
  { method: "PUT", path: /^\/products\/\d+\/?$/ },
  { method: "PATCH", path: /^\/catalog\/\d+\/?$/ },
];

function matches(routes, req) {
  return routes.some((r) => (r.method === "*" || r.method === req.method) && r.path.test(req.path));
}

// Role lives in the Clerk user's public metadata, e.g. { "role": "designer" }.
// No role means full access. Cached briefly so each request doesn't hit Clerk.
const ROLE_TTL_MS = 60 * 1000;
const roleCache = new Map();

// Also returns the person's name (for change history)
async function getUserInfo(userId) {
  const cached = roleCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached;
  const user = await clerkClient.users.getUser(userId);
  const role = String(user.publicMetadata?.role || "admin").trim().toLowerCase();
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ")
    || user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
    || user.username
    || "Unknown";
  const info = { role, name, expires: Date.now() + ROLE_TTL_MS };
  roleCache.set(userId, info);
  return info;
}

// Mounted at /api: every request needs a valid Clerk session token, except the
// public catalog reads. Sets req.userId and req.role for the route handlers.
async function authenticate(req, res, next) {
  if (req.method === "OPTIONS" || matches(PUBLIC_ROUTES, req)) return next();

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Sign in required" });

  let userId;
  try {
    const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    userId = claims.sub;
  } catch {
    return res.status(401).json({ message: "Session expired, please sign in again" });
  }

  try {
    req.userId = userId;
    const info = await getUserInfo(userId);
    req.role = info.role;
    req.userName = info.name;
  } catch (err) {
    return next(err);
  }

  if (req.role === "designer" && !matches(DESIGNER_ROUTES, req)) {
    return res.status(403).json({ message: "You don't have access to this" });
  }
  next();
}

module.exports = { authenticate };

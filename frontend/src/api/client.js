// In dev, Vite's proxy (vite.config.js) forwards /api to localhost:4000, so the
// relative path works with no env var needed. In production there is no dev
// server/proxy, so VITE_API_URL must point at the deployed backend's origin.
const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: "DELETE" }),
};

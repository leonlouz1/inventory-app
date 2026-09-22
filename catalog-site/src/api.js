const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const api = {
  listProducts: () => get("/catalog"),
  getProduct: (sku) => get(`/catalog/${encodeURIComponent(sku)}`),
};

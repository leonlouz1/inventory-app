import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");

  useEffect(() => {
    api.listProducts().then(setProducts).finally(() => setLoading(false));
  }, []);

  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
    const matchBrand = !brand || p.brand === brand;
    return matchSearch && matchBrand;
  });

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 240px",
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: 14,
            outline: "none",
          }}
        />
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          style={{
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: 14,
            background: "#fff",
            minWidth: 160,
          }}
        >
          <option value="">All brands</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: "#999", textAlign: "center", marginTop: 80 }}>Loading products…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "#999", textAlign: "center", marginTop: 80 }}>No products found.</p>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 20,
        }}>
          {filtered.map((p) => (
            <Link key={p.id} to={`/${p.sku}`} style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e8e8e8",
              overflow: "hidden",
              transition: "box-shadow 0.15s",
              display: "block",
            }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.10)"}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}
            >
              <div style={{
                width: "100%",
                aspectRatio: "1",
                background: "#f5f5f3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}>
                {p.imageUrl
                  ? <img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12 }} />
                  : <span style={{ fontSize: 36, color: "#ccc" }}>📦</span>
                }
              </div>
              <div style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#999", marginBottom: 4, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  {p.brand || "—"}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{p.sku}</div>
                {p.wholesalePrice && (
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    ${Number(p.wholesalePrice).toFixed(2)}
                    {p.retailPrice && (
                      <span style={{ fontWeight: 400, fontSize: 12, color: "#999", marginLeft: 6 }}>
                        MSRP ${Number(p.retailPrice).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";

export default function ProductPage() {
  const { sku } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.getProduct(sku)
      .then(setProduct)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [sku]);

  if (loading) return <p style={{ textAlign: "center", marginTop: 80, color: "#999" }}>Loading…</p>;
  if (notFound) return (
    <main style={{ maxWidth: 600, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
      <p style={{ fontSize: 18, marginBottom: 16 }}>Product not found.</p>
      <Link to="/" style={{ color: "#2563eb" }}>← Back to catalog</Link>
    </main>
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
      <Link to="/" style={{ fontSize: 14, color: "#666", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 32 }}>
        ← Back to catalog
      </Link>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
        {/* Image */}
        <div style={{
          background: "#f5f5f3",
          borderRadius: 16,
          aspectRatio: "1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}>
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 24 }} />
            : <span style={{ fontSize: 64, color: "#ccc" }}>📦</span>
          }
        </div>

        {/* Info */}
        <div>
          {product.brand && (
            <div style={{ fontSize: 12, fontWeight: 600, color: "#888", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
              {product.brand}
            </div>
          )}
          <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.25, marginBottom: 8 }}>{product.name}</h1>
          <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>SKU: {product.sku}</div>

          {product.description && (
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#444", marginBottom: 24 }}>{product.description}</p>
          )}

          {/* Pricing */}
          {(product.wholesalePrice || product.retailPrice) && (
            <div style={{ background: "#f8f8f6", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
              {product.wholesalePrice && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 14, color: "#666" }}>Wholesale</span>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>${Number(product.wholesalePrice).toFixed(2)}</span>
                </div>
              )}
              {product.retailPrice && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 14, color: "#666" }}>MSRP</span>
                  <span style={{ fontSize: 15, color: "#888" }}>${Number(product.retailPrice).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Details */}
          <div style={{ borderTop: "1px solid #e8e8e8", paddingTop: 20 }}>
            {[
              product.upc && ["UPC", product.upc],
              product.casePack && ["Case Pack", `${product.casePack} units`],
              product.category && ["Category", product.category],
            ].filter(Boolean).map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: "#888" }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

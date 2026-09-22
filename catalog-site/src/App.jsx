import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ProductPage from "./pages/ProductPage";

const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Wholesale Catalog";

export default function App() {
  return (
    <BrowserRouter>
      <header style={{
        background: "#fff",
        borderBottom: "1px solid #e8e8e8",
        padding: "0 32px",
        height: 60,
        display: "flex",
        alignItems: "center",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <a href="/" style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.3px" }}>{COMPANY}</a>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:sku" element={<ProductPage />} />
      </Routes>
    </BrowserRouter>
  );
}

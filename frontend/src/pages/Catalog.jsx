import { useEffect, useState } from "react";
import { Table, Typography, Button, Input, Spin, message, Form, Modal, Image, Select } from "antd";
import { DownloadOutlined, EditOutlined } from "@ant-design/icons";
import { catalogApi } from "../api/catalog";
import { downloadAvailableToSellReport } from "../utils/availableToSellReport";
import ProductWindow from "../components/ProductWindow";
import { useRole } from "../hooks/useRole";

const PUBLIC_CATALOG_URL = import.meta.env.VITE_PUBLIC_CATALOG_URL || "";

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState("");
  const [reportModal, setReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState(null);
  const [reportBrand, setReportBrand] = useState(null);
  const { isDesigner } = useRole();

  useEffect(() => {
    catalogApi.list()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();

  async function handleDownload() {
    setDownloading(true);
    try {
      const rows = await catalogApi.availableToSell();
      const filtered = rows.filter((r) => {
        if (reportCategory && r.category !== reportCategory) return false;
        if (reportBrand && r.brand !== reportBrand) return false;
        return true;
      });
      downloadAvailableToSellReport(filtered, PUBLIC_CATALOG_URL);
      setReportModal(false);
      setReportCategory(null);
      setReportBrand(null);
    } catch (err) {
      message.error(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const filtered = products.filter((p) =>
    !search || p.sku.includes(search.toUpperCase()) || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      title: "Image",
      dataIndex: "imageUrl",
      width: 72,
      render: (url) => url
        ? <Image src={url} width={48} height={48} style={{ objectFit: "contain" }} />
        : <div style={{ width: 48, height: 48, background: "#f5f5f5", borderRadius: 4 }} />,
    },
    { title: "SKU", dataIndex: "sku", width: 130 },
    { title: "Product", dataIndex: "name" },
    { title: "Brand", dataIndex: "brand", render: (v) => v || "—" },
    {
      title: "Details",
      dataIndex: "attributes",
      render: (attrs) => {
        if (!attrs || !Object.keys(attrs).length) return <span style={{ color: "#bbb" }}>—</span>;
        const entries = Object.entries(attrs).filter(([, v]) => v);
        return <span style={{ color: "#595959", fontSize: 12 }}>{entries.map(([, v]) => v).join(", ")}</span>;
      },
    },
    { title: "UPC", dataIndex: "upc", render: (v) => v || "—" },
    { title: "Case Pack", dataIndex: "casePack", align: "right" },
    { title: "Wholesale", dataIndex: "wholesalePrice", align: "right", render: (v) => v ? `$${Number(v).toFixed(2)}` : "—" },
    { title: "Retail", dataIndex: "retailPrice", align: "right", render: (v) => v ? `$${Number(v).toFixed(2)}` : "—" },
    {
      title: "Description",
      dataIndex: "description",
      render: (v) => v
        ? <span style={{ color: "#595959" }}>{v.length > 60 ? v.slice(0, 60) + "…" : v}</span>
        : <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      title: "",
      key: "actions",
      width: 48,
      render: (_, p) => (
        <Button icon={<EditOutlined />} type="text" onClick={() => setEditing(p)} />
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Catalog</Typography.Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Input.Search
            placeholder="Search SKU or product"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
          {!isDesigner && (
            <Button
              icon={<DownloadOutlined />}
              onClick={() => setReportModal(true)}
            >
              Available to Sell
            </Button>
          )}
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        pagination={{ defaultPageSize: 50, showSizeChanger: true }}
        size="small"
      />

      <Modal
        title="Available to Sell Report"
        open={reportModal}
        onCancel={() => { setReportModal(false); setReportCategory(null); setReportBrand(null); }}
        onOk={handleDownload}
        okText="Download Excel"
        confirmLoading={downloading}
        okButtonProps={{ icon: <DownloadOutlined /> }}
      >
        <p style={{ color: "#666", marginBottom: 16 }}>
          Filter by product type and/or brand. Leave blank to include all.
        </p>
        <Form layout="vertical">
          <Form.Item label="Product Type (Category)">
            <Select
              allowClear
              placeholder="All categories"
              value={reportCategory}
              onChange={setReportCategory}
              options={categories.map((c) => ({ value: c, label: c }))}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="Brand">
            <Select
              allowClear
              placeholder="All brands"
              value={reportBrand}
              onChange={setReportBrand}
              options={[{ value: null, label: "All Brands" }, ...brands.map((b) => ({ value: b, label: b }))]}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {editing && (
        <ProductWindow
          key={editing.id}
          productId={editing.id}
          initialTab="catalog"
          onClose={() => setEditing(null)}
          onSaved={() => catalogApi.list().then(setProducts)}
        />
      )}
    </Spin>
  );
}

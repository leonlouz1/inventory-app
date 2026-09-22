import { useEffect, useState } from "react";
import { Table, Typography, Button, Input, InputNumber, Spin, message, Form, Modal, Image } from "antd";
import { DownloadOutlined, EditOutlined } from "@ant-design/icons";
import { catalogApi } from "../api/catalog";
import { downloadAvailableToSellReport } from "../utils/availableToSellReport";

const PUBLIC_CATALOG_URL = import.meta.env.VITE_PUBLIC_CATALOG_URL || "";

function EditCatalogModal({ product, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      form.setFieldsValue({
        description: product.description || "",
        wholesalePrice: product.wholesalePrice,
        retailPrice: product.retailPrice,
        imageUrl: product.imageUrl || "",
        casePack: product.casePack,
        upc: product.upc || "",
      });
    }
  }, [product, form]);

  async function handleSave() {
    const values = form.getFieldsValue();
    setSaving(true);
    try {
      const updated = await catalogApi.update(product.id, values);
      onSaved(updated);
      onClose();
      message.success("Catalog updated");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Edit Catalog — ${product?.sku}`}
      open={!!product}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="Save"
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item label="Image URL" name="imageUrl">
          <Input placeholder="https://..." />
        </Form.Item>
        {form.getFieldValue("imageUrl") && (
          <div style={{ marginBottom: 12 }}>
            <Image src={form.getFieldValue("imageUrl")} height={120} style={{ objectFit: "contain" }} />
          </div>
        )}
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <div style={{ display: "flex", gap: 16 }}>
          <Form.Item label="Wholesale Price" name="wholesalePrice" style={{ flex: 1 }}>
            <InputNumber prefix="$" style={{ width: "100%" }} precision={2} min={0} />
          </Form.Item>
          <Form.Item label="Retail Price" name="retailPrice" style={{ flex: 1 }}>
            <InputNumber prefix="$" style={{ width: "100%" }} precision={2} min={0} />
          </Form.Item>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Form.Item label="Case Pack" name="casePack" style={{ flex: 1 }}>
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
          <Form.Item label="UPC" name="upc" style={{ flex: 1 }}>
            <Input />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    catalogApi.list()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload() {
    setDownloading(true);
    try {
      const rows = await catalogApi.availableToSell();
      downloadAvailableToSellReport(rows, PUBLIC_CATALOG_URL);
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
          <Button
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={handleDownload}
          >
            Available to Sell
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        pagination={{ defaultPageSize: 50, showSizeChanger: true }}
        size="small"
      />

      <EditCatalogModal
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => setProducts((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p))}
      />
    </Spin>
  );
}

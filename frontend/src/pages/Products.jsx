import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table, Button, Spin, Alert, Typography, Space, Popconfirm, message, Tooltip, Input } from "antd";
import { PlusOutlined, UploadOutlined, DeleteOutlined, DownloadOutlined, SwapOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import { productsApi, warehousesApi } from "../api/inventory";
import { downloadInventoryReport } from "../utils/inventoryReport";
import { NewProductModal, EditProductModal } from "../components/ProductModals";
import BulkImportProductsModal from "../components/BulkImportProductsModal";
import WarehouseTransferModal from "../components/WarehouseTransferModal";
import { PRODUCT_CATEGORIES } from "../constants/categories";
import { PRODUCT_BRANDS } from "../constants/brands";

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)
    );
  }, [products, search]);

  const loadProducts = useCallback(() => {
    setLoading(true);
    return productsApi
      .list()
      .then((data) => {
        setProducts(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadProducts();
    warehousesApi.list().then(setWarehouses);
  }, [loadProducts]);

  function handleExportAvailableToSell() {
    const rows = products
      .filter((p) => p.availableToSell > 0)
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        available_to_sell: p.availableToSell,
      }));
    const csv = Papa.unparse(rows);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`available_to_sell_${today}.csv`, csv);
  }

  async function handleDelete(product) {
    try {
      await productsApi.delete(product.id);
      message.success(`${product.sku} deleted`);
      loadProducts();
    } catch (err) {
      message.error(err.message);
    }
  }

  const columns = useMemo(
    () => [
      {
        title: "SKU",
        dataIndex: "sku",
        sorter: (a, b) => a.sku.localeCompare(b.sku),
        render: (sku) => (
          <Link to={`/timeline?sku=${encodeURIComponent(sku)}`} onClick={(e) => e.stopPropagation()}>
            {sku}
          </Link>
        ),
      },
      { title: "Name", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
      {
        title: "Brand",
        dataIndex: "brand",
        render: (v) => v || "—",
        filters: PRODUCT_BRANDS.map((b) => ({ text: b, value: b })),
        onFilter: (value, product) => product.brand === value,
        sorter: (a, b) => (a.brand || "").localeCompare(b.brand || ""),
      },
      {
        title: "Category",
        dataIndex: "category",
        render: (v) => v || "—",
        filters: PRODUCT_CATEGORIES.map((c) => ({ text: c, value: c })),
        onFilter: (value, product) => product.category === value,
        sorter: (a, b) => (a.category || "").localeCompare(b.category || ""),
      },
      ...warehouses.map((w) => ({
        title: w.name,
        key: `wh-${w.id}`,
        align: "right",
        render: (_, product) => product.stockByWarehouse[w.id] ?? 0,
        sorter: (a, b) => (a.stockByWarehouse[w.id] ?? 0) - (b.stockByWarehouse[w.id] ?? 0),
      })),
      {
        title: "Pending Orders",
        dataIndex: "pendingQty",
        align: "right",
        sorter: (a, b) => a.pendingQty - b.pendingQty,
      },
      {
        title: (
          <Tooltip title="On hand minus pending (unshipped) orders, across all warehouses">
            Available to Sell
          </Tooltip>
        ),
        dataIndex: "availableToSell",
        align: "right",
        sorter: (a, b) => a.availableToSell - b.availableToSell,
        render: (v) => <span style={{ color: v < 0 ? "#cf1322" : undefined, fontWeight: 600 }}>{v}</span>,
      },
      {
        title: "Reorder Point",
        dataIndex: "reorderPoint",
        align: "right",
        sorter: (a, b) => a.reorderPoint - b.reorderPoint,
      },
      {
        title: "Reorder Qty",
        dataIndex: "reorderQty",
        align: "right",
        sorter: (a, b) => a.reorderQty - b.reorderQty,
      },
      {
        title: "Lead Time (days)",
        dataIndex: "leadTimeDays",
        align: "right",
        sorter: (a, b) => a.leadTimeDays - b.leadTimeDays,
      },
      {
        title: "",
        key: "actions",
        render: (_, product) => (
          <Popconfirm
            title={`Delete ${product.sku}?`}
            description="This is only allowed if it has no order lines or restocks on record."
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDelete(product);
            }}
          >
            <Button icon={<DeleteOutlined />} danger type="text" onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        ),
      },
    ],
    [warehouses]
  );

  if (error) {
    return <Alert type="error" message="Failed to load products" description={error} showIcon />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Products
        </Typography.Title>
        <Space>
          <Input.Search
            placeholder="Search SKU or name"
            allowClear
            style={{ width: 240 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button icon={<SwapOutlined />} onClick={() => setTransferOpen(true)}>
            Transfer Stock
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadInventoryReport(products)}>
            Inventory Report
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportAvailableToSell}>
            Export Available to Sell
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add Product
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredProducts}
        rowKey="id"
        pagination={{ pageSize: 20 }}
        onRow={(product) => ({
          onClick: () => setEditingProduct(product),
          style: { cursor: "pointer" },
        })}
      />

      <NewProductModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadProducts}
        warehouses={warehouses}
      />

      <EditProductModal
        open={!!editingProduct}
        onClose={() => setEditingProduct(null)}
        onUpdated={loadProducts}
        product={editingProduct}
        warehouses={warehouses}
      />

      <BulkImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={loadProducts}
        warehouses={warehouses}
      />

      <WarehouseTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onTransferred={loadProducts}
        products={products}
        warehouses={warehouses}
      />
    </Spin>
  );
}

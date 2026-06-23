import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table, Button, Spin, Alert, Typography, Space, Popconfirm, message } from "antd";
import { PlusOutlined, UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import { productsApi, warehousesApi } from "../api/inventory";
import { NewProductModal, EditProductModal } from "../components/ProductModals";
import BulkImportProductsModal from "../components/BulkImportProductsModal";
import { PRODUCT_CATEGORIES } from "../constants/categories";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

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
        filters: [...new Set(products.map((p) => p.brand).filter(Boolean))]
          .sort()
          .map((b) => ({ text: b, value: b })),
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
    [warehouses, products]
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
        dataSource={products}
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
      />

      <BulkImportProductsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={loadProducts}
        warehouses={warehouses}
      />
    </Spin>
  );
}

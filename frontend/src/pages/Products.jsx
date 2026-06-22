import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table, Button, Spin, Alert, Typography, Space } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
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

  const columns = useMemo(
    () => [
      {
        title: "SKU",
        dataIndex: "sku",
        render: (sku) => (
          <Link to={`/timeline?sku=${encodeURIComponent(sku)}`} onClick={(e) => e.stopPropagation()}>
            {sku}
          </Link>
        ),
      },
      { title: "Name", dataIndex: "name" },
      {
        title: "Category",
        dataIndex: "category",
        render: (v) => v || "—",
        filters: PRODUCT_CATEGORIES.map((c) => ({ text: c, value: c })),
        onFilter: (value, product) => product.category === value,
      },
      ...warehouses.map((w) => ({
        title: w.name,
        key: `wh-${w.id}`,
        align: "right",
        render: (_, product) => product.stockByWarehouse[w.id] ?? 0,
      })),
      { title: "Reorder Point", dataIndex: "reorderPoint", align: "right" },
      { title: "Reorder Qty", dataIndex: "reorderQty", align: "right" },
      { title: "Lead Time (days)", dataIndex: "leadTimeDays", align: "right" },
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

import { useCallback, useEffect, useState } from "react";
import { Table, Button, Spin, Alert, Typography, Popconfirm, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { restocksApi, productsApi, warehousesApi } from "../api/inventory";
import { NewRestockModal, EditRestockModal } from "../components/RestockModals";

export default function Restocks() {
  const [restocks, setRestocks] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingRestock, setEditingRestock] = useState(null);

  const loadRestocks = useCallback(() => {
    setLoading(true);
    return restocksApi
      .list()
      .then((data) => {
        setRestocks(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRestocks();
    productsApi.list().then(setProducts);
    warehousesApi.list().then(setWarehouses);
  }, [loadRestocks]);

  async function handleDelete(id) {
    try {
      await restocksApi.delete(id);
      message.success("Restock deleted");
      loadRestocks();
    } catch (err) {
      message.error(`Failed to delete restock: ${err.message}`);
    }
  }

  const columns = [
    { title: "SKU", dataIndex: "sku" },
    { title: "Product Name", dataIndex: "productName" },
    { title: "Warehouse", dataIndex: "warehouseName" },
    { title: "Units Arriving", dataIndex: "quantity", align: "right" },
    { title: "Expected Date", dataIndex: "expectedDate" },
    { title: "Supplier / PO", dataIndex: "supplier", render: (v) => v || "—" },
    {
      title: "",
      key: "actions",
      render: (_, restock) => (
        <>
          <Button icon={<EditOutlined />} type="text" onClick={() => setEditingRestock(restock)} />
          <Popconfirm title="Delete this restock?" onConfirm={() => handleDelete(restock.id)}>
            <Button icon={<DeleteOutlined />} danger type="text" />
          </Popconfirm>
        </>
      ),
    },
  ];

  if (error) {
    return <Alert type="error" message="Failed to load restocks" description={error} showIcon />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Restocks
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Log Restock
        </Button>
      </div>

      <Table columns={columns} dataSource={restocks} rowKey="id" pagination={{ pageSize: 20 }} />

      <NewRestockModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadRestocks}
        products={products}
        warehouses={warehouses}
      />

      <EditRestockModal
        open={!!editingRestock}
        onClose={() => setEditingRestock(null)}
        onUpdated={loadRestocks}
        restock={editingRestock}
        warehouses={warehouses}
      />
    </Spin>
  );
}

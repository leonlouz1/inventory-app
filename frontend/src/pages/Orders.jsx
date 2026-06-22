import { useEffect, useState, useCallback } from "react";
import { Table, Button, Tag, Spin, Alert, Popconfirm, message, Typography } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { ordersApi, productsApi, warehousesApi } from "../api/inventory";
import NewOrderModal from "../components/NewOrderModal";
import EditOrderLineModal from "../components/EditOrderLineModal";

function ProjectionTag({ projection }) {
  if (!projection) return null;
  return projection.ok ? (
    <Tag color="green">✓ {projection.balance}</Tag>
  ) : (
    <Tag color="red">⚠ {projection.balance} (deficit {projection.deficit})</Tag>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState(null); // { orderId, line }

  const loadOrders = useCallback(() => {
    setLoading(true);
    return ordersApi
      .list()
      .then((data) => {
        setOrders(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOrders();
    Promise.all([productsApi.list(), warehousesApi.list()]).then(([p, w]) => {
      setProducts(p);
      setWarehouses(w);
    });
  }, [loadOrders]);

  async function handleDelete(orderId) {
    try {
      await ordersApi.delete(orderId);
      message.success("Order deleted");
      loadOrders();
    } catch (err) {
      message.error(`Failed to delete order: ${err.message}`);
    }
  }

  const columns = [
    { title: "Order #", dataIndex: "orderNumber" },
    { title: "Customer", dataIndex: "customer" },
    { title: "Customer PO #", dataIndex: "customerPo", render: (v) => v || "—" },
    { title: "Order Date", dataIndex: "orderDate" },
    { title: "# Lines", dataIndex: "lineCount" },
    { title: "Earliest Ship Date", dataIndex: "earliestShipDate" },
    { title: "Latest Ship Date", dataIndex: "latestShipDate" },
    {
      title: "Status",
      dataIndex: "status",
      render: (status) => <Tag color={status === "OK" ? "green" : "red"}>{status}</Tag>,
    },
    {
      title: "",
      key: "actions",
      render: (_, order) => (
        <Popconfirm title="Delete this order?" onConfirm={() => handleDelete(order.id)}>
          <Button icon={<DeleteOutlined />} danger type="text" />
        </Popconfirm>
      ),
    },
  ];

  if (error) {
    return <Alert type="error" message="Failed to load orders" description={error} showIcon />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Orders
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New Order
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={orders}
        rowKey="id"
        pagination={{ pageSize: 15 }}
        expandable={{
          expandedRowRender: (order) => {
            const lineColumns = [
              { title: "SKU", dataIndex: "sku" },
              { title: "Product", dataIndex: "productName" },
              { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
              { title: "Qty", dataIndex: "quantity" },
              { title: "Ship Date", dataIndex: "shipDate" },
              { title: "Projection", dataIndex: "projection", render: (p) => <ProjectionTag projection={p} /> },
              {
                title: "",
                key: "actions",
                render: (_, line) => (
                  <Button
                    icon={<EditOutlined />}
                    type="text"
                    onClick={() => setEditingLine({ orderId: order.id, line })}
                  />
                ),
              },
            ];
            return <Table columns={lineColumns} dataSource={order.lines} rowKey="id" pagination={false} size="small" />;
          },
        }}
      />

      <NewOrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={loadOrders}
        products={products}
        warehouses={warehouses}
      />

      <EditOrderLineModal
        open={!!editingLine}
        onClose={() => setEditingLine(null)}
        onUpdated={loadOrders}
        orderId={editingLine?.orderId}
        line={editingLine?.line}
        warehouses={warehouses}
      />
    </Spin>
  );
}

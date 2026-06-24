import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Table, Button, Tag, Spin, Alert, Popconfirm, message, Typography, Space, Select, Modal } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import { ordersApi, productsApi, warehousesApi } from "../api/inventory";
import NewOrderModal from "../components/NewOrderModal";
import EditOrderLineModal from "../components/EditOrderLineModal";
import BulkImportOrdersModal from "../components/BulkImportOrdersModal";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "../constants/orderStatuses";

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }));

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
  const [importOpen, setImportOpen] = useState(false);
  const [editingLine, setEditingLine] = useState(null); // { orderId, line }
  const [alertOrder, setAlertOrder] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight") ? Number(searchParams.get("highlight")) : null;
  const [expandedRowKeys, setExpandedRowKeys] = useState(highlightId ? [highlightId] : []);

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

  useEffect(() => {
    if (!highlightId || orders.length === 0) return;
    setExpandedRowKeys((prev) => (prev.includes(highlightId) ? prev : [...prev, highlightId]));
    const row = document.getElementById(`order-row-${highlightId}`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, orders.length]);

  async function handleDelete(orderId) {
    try {
      await ordersApi.delete(orderId);
      message.success("Order deleted");
      loadOrders();
    } catch (err) {
      message.error(`Failed to delete order: ${err.message}`);
    }
  }

  async function applyStatusChange(order, newStatus) {
    try {
      await ordersApi.updateStatus(order.id, newStatus);
      message.success(`${order.orderNumber} marked ${ORDER_STATUS_LABELS[newStatus]}`);
      loadOrders();
    } catch (err) {
      message.error(`Failed to update status: ${err.message}`);
    }
  }

  function handleStatusChange(order, newStatus) {
    const crossesShippedBoundary = order.status === "SHIPPED" || newStatus === "SHIPPED";
    if (!crossesShippedBoundary) {
      applyStatusChange(order, newStatus);
      return;
    }

    const goingToShipped = newStatus === "SHIPPED";
    Modal.confirm({
      title: goingToShipped ? "Mark as Shipped?" : "Move off Shipped?",
      content: goingToShipped
        ? "This will deduct each line's quantity from on-hand stock at its assigned warehouse — a real inventory transaction, not just a projection."
        : "This will restore each line's quantity back to on-hand stock, undoing the deduction made when it was marked Shipped.",
      okText: "Confirm",
      cancelText: "Cancel",
      onOk: () => applyStatusChange(order, newStatus),
    });
  }

  const sortString = (key) => (a, b) => (a[key] || "").localeCompare(b[key] || "");
  const sortNumber = (key) => (a, b) => (a[key] ?? 0) - (b[key] ?? 0);

  const columns = [
    { title: "Order #", dataIndex: "orderNumber", sorter: sortString("orderNumber") },
    {
      title: "Customer",
      dataIndex: "customer",
      sorter: sortString("customer"),
      render: (customer) => <Link to={`/customers?name=${encodeURIComponent(customer)}`}>{customer}</Link>,
    },
    {
      title: "Customer PO #",
      dataIndex: "customerPo",
      render: (v) => v || "—",
      sorter: sortString("customerPo"),
    },
    { title: "Order Date", dataIndex: "orderDate", sorter: sortString("orderDate") },
    { title: "# Lines", dataIndex: "lineCount", sorter: sortNumber("lineCount") },
    { title: "Earliest Ship Date", dataIndex: "earliestShipDate", sorter: sortString("earliestShipDate") },
    { title: "Latest Ship Date", dataIndex: "latestShipDate", sorter: sortString("latestShipDate") },
    {
      title: "Order Status",
      dataIndex: "status",
      sorter: sortString("status"),
      render: (status, order) => (
        <Select
          size="small"
          value={status}
          options={STATUS_OPTIONS}
          style={{ width: 130 }}
          onChange={(newStatus) => handleStatusChange(order, newStatus)}
          variant="filled"
          popupMatchSelectWidth={false}
          labelRender={() => <Tag color={ORDER_STATUS_COLORS[status]}>{ORDER_STATUS_LABELS[status]}</Tag>}
        />
      ),
    },
    {
      title: "Alerts",
      dataIndex: "alertStatus",
      render: (status, order) =>
        status === "OK" ? (
          <Tag color="green">{status}</Tag>
        ) : (
          <Tag color="red" style={{ cursor: "pointer" }} onClick={() => setAlertOrder(order)}>
            {status}
          </Tag>
        ),
      sorter: sortString("alertStatus"),
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
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
            Import CSV
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New Order
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={orders}
        rowKey="id"
        pagination={{ pageSize: 15 }}
        onRow={(order) => ({ id: `order-row-${order.id}` })}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: setExpandedRowKeys,
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
        products={products}
      />

      <BulkImportOrdersModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={loadOrders}
        products={products}
        warehouses={warehouses}
      />

      <Modal
        title={`Alerts — ${alertOrder?.orderNumber ?? ""}`}
        open={!!alertOrder}
        onCancel={() => setAlertOrder(null)}
        footer={null}
      >
        {alertOrder && (
          <Table
            columns={[
              { title: "SKU", dataIndex: "sku" },
              { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
              { title: "Ship Date", dataIndex: "shipDate" },
              {
                title: "Issue",
                key: "issue",
                render: (_, line) => (
                  <span>
                    Projected balance {line.projection.balance}
                    {line.projection.deficit != null && ` (deficit ${line.projection.deficit})`}
                    {line.projection.date && ` — first dips below 0 on ${line.projection.date}`}
                  </span>
                ),
              },
            ]}
            dataSource={alertOrder.lines.filter((l) => !l.projection.ok)}
            rowKey="id"
            pagination={false}
            size="small"
          />
        )}
      </Modal>
    </Spin>
  );
}

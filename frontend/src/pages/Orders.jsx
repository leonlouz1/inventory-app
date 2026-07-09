import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { Table, Button, Tag, Spin, Alert, Popconfirm, message, Typography, Space, Select, Modal, Input } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, UploadOutlined, FileExcelOutlined, TruckOutlined } from "@ant-design/icons";
import { ordersApi, productsApi, warehousesApi, restocksApi, shipmentsApi } from "../api/inventory";
import NewOrderModal from "../components/NewOrderModal";
import EditOrderLineModal from "../components/EditOrderLineModal";
import AddOrderLineModal from "../components/AddOrderLineModal";
import BulkImportOrdersModal from "../components/BulkImportOrdersModal";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "../constants/orderStatuses";
import { downloadPackingList } from "../utils/packingList";

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }));

function OrderNotes({ order, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await ordersApi.updateNotes(order.id, value || null);
      onSaved(value || null);
      setEditing(false);
    } catch (err) {
      message.error(`Failed to save notes: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Input.TextArea
          autoFocus
          rows={2}
          style={{ maxWidth: 500 }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add notes…"
        />
        <Button type="primary" size="small" loading={saving} onClick={save}>Save</Button>
        <Button size="small" onClick={() => { setValue(order.notes || ""); setEditing(false); }}>Cancel</Button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 6 }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>Notes:</Typography.Text>
      {order.notes ? (
        <Typography.Text style={{ fontSize: 13 }}>{order.notes}</Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 13, fontStyle: "italic" }}>None</Typography.Text>
      )}
      <Button
        type="link"
        size="small"
        icon={<EditOutlined />}
        style={{ padding: "0 4px", height: "auto", lineHeight: 1 }}
        onClick={() => { setValue(order.notes || ""); setEditing(true); }}
      />
    </div>
  );
}

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
  const [restocks, setRestocks] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingLine, setEditingLine] = useState(null); // { orderId, line }
  const [addingLineToOrder, setAddingLineToOrder] = useState(null); // order
  const [alertOrder, setAlertOrder] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight") ? Number(searchParams.get("highlight")) : null;
  const [expandedRowKeys, setExpandedRowKeys] = useState(highlightId ? [highlightId] : []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);

  const restocksByOrderId = useMemo(() => {
    const map = new Map();
    for (const r of restocks) {
      if (!r.linkedOrderId) continue;
      if (!map.has(r.linkedOrderId)) map.set(r.linkedOrderId, []);
      map.get(r.linkedOrderId).push(r);
    }
    return map;
  }, [restocks]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter.length > 0 && !statusFilter.includes(o.status)) return false;
      if (!term) return true;
      return (
        o.orderNumber.toLowerCase().includes(term) ||
        o.customer.toLowerCase().includes(term) ||
        (o.customerPo || "").toLowerCase().includes(term)
      );
    });
  }, [orders, search, statusFilter]);

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
    Promise.all([productsApi.list(), warehousesApi.list(), restocksApi.list(), shipmentsApi.list()]).then(([p, w, r, s]) => {
      setProducts(p);
      setWarehouses(w);
      setRestocks(r);
      setShipments(s);
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
        <>
          <Button
            icon={<FileExcelOutlined />}
            type="text"
            title="Download packing list"
            onClick={(e) => {
              e.stopPropagation();
              downloadPackingList(order);
            }}
          />
          <Popconfirm title="Delete this order?" onConfirm={() => handleDelete(order.id)}>
            <Button icon={<DeleteOutlined />} danger type="text" />
          </Popconfirm>
        </>
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
          <Input.Search
            placeholder="Search order #, customer, or PO"
            allowClear
            style={{ width: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            mode="multiple"
            placeholder="Filter by status (all)"
            allowClear
            style={{ minWidth: 220 }}
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={setStatusFilter}
            maxTagCount="responsive"
          />
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
        dataSource={filteredOrders}
        rowKey="id"
        pagination={{ defaultPageSize: 15, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
        onRow={(order) => ({ id: `order-row-${order.id}` })}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: setExpandedRowKeys,
          expandedRowRender: (order) => {
            const lineColumns = [
              {
                title: "SKU",
                dataIndex: "sku",
                render: (sku) => (
                  <Link to={`/timeline?sku=${encodeURIComponent(sku)}`} onClick={(e) => e.stopPropagation()}>
                    {sku}
                  </Link>
                ),
              },
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
            const linkedRestocks = restocksByOrderId.get(order.id) || [];
            return (
              <>
                <Table columns={lineColumns} dataSource={order.lines} rowKey="id" pagination={false} size="small" />
                <Space style={{ marginTop: 8 }}>
                  {order.status !== "SHIPPED" && order.status !== "CANCELLED" && (
                    <Button
                      icon={<PlusOutlined />}
                      size="small"
                      onClick={() => setAddingLineToOrder(order)}
                    >
                      Add SKU
                    </Button>
                  )}
                  {order.status !== "SHIPPED" && order.status !== "CANCELLED" && (
                    <Select
                      size="small"
                      placeholder={<><TruckOutlined /> Add to shipment</>}
                      style={{ minWidth: 180 }}
                      value={order.shipmentId || undefined}
                      options={shipments
                        .filter((s) => s.status !== "DELIVERED")
                        .map((s) => ({ value: s.id, label: `${s.shipmentNumber} · ${dayjs(s.pickupDate).format("MMM D")}` }))}
                      onChange={async (shipmentId) => {
                        try {
                          await shipmentsApi.addOrder(shipmentId, order.id);
                          message.success(`Added to shipment`);
                          loadOrders();
                          const [, , , s] = await Promise.all([productsApi.list(), warehousesApi.list(), restocksApi.list(), shipmentsApi.list()]);
                          setShipments(s);
                        } catch (err) {
                          message.error(err.message);
                        }
                      }}
                      allowClear
                      onClear={async () => {
                        if (!order.shipmentId) return;
                        try {
                          await shipmentsApi.removeOrder(order.shipmentId, order.id);
                          message.success("Removed from shipment");
                          loadOrders();
                          shipmentsApi.list().then(setShipments);
                        } catch (err) {
                          message.error(err.message);
                        }
                      }}
                    />
                  )}
                </Space>
                <OrderNotes
                  order={order}
                  onSaved={(notes) =>
                    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, notes } : o))
                  }
                />
                {linkedRestocks.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <Typography.Text strong style={{ fontSize: 13 }}>Linked Containers ({linkedRestocks.length} line{linkedRestocks.length > 1 ? "s" : ""})</Typography.Text>
                    <Table
                      size="small"
                      pagination={false}
                      style={{ marginTop: 6 }}
                      rowKey="id"
                      dataSource={linkedRestocks}
                      columns={[
                        { title: "SKU", dataIndex: "sku", render: (sku) => <Link to={`/timeline?sku=${encodeURIComponent(sku)}`}>{sku}</Link> },
                        { title: "Product", dataIndex: "productName" },
                        { title: "Warehouse", dataIndex: "warehouseName" },
                        { title: "Qty Incoming", dataIndex: "quantity" },
                        { title: "Expected Date", dataIndex: "expectedDate" },
                        { title: "Supplier / PO", dataIndex: "supplier", render: (v) => v || "—" },
                      ]}
                    />
                  </div>
                )}
              </>
            );
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

      <AddOrderLineModal
        open={!!addingLineToOrder}
        onClose={() => setAddingLineToOrder(null)}
        onAdded={loadOrders}
        orderId={addingLineToOrder?.id}
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
              {
                title: "SKU",
                dataIndex: "sku",
                render: (sku) => <Link to={`/timeline?sku=${encodeURIComponent(sku)}`}>{sku}</Link>,
              },
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

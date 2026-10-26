import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  Alert, Button, Card, Descriptions, DatePicker, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Typography, message,
} from "antd";
import {
  ArrowLeftOutlined, DeleteOutlined, EditOutlined, FileExcelOutlined, MailOutlined, PlusOutlined, ScissorOutlined,
} from "@ant-design/icons";
import { ordersApi, productsApi, skuGroupsApi, warehousesApi } from "../../api/inventory";
import { ORDER_STATUSES, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "../../constants/orderStatuses";
import { downloadPackingList } from "../../utils/packingList";
import { showShadowMessages } from "../../utils/shadowMessages";
import ProjectionTag from "../../components/ProjectionTag";
import CancelDateTag from "../../components/CancelDateTag";
import OrderHistory from "../../components/OrderHistory";
import OrderDocuments from "../../components/OrderDocuments";
import EmailOrderModal from "../../components/EmailOrderModal";
import EditOrderLineModal from "../../components/EditOrderLineModal";
import AddOrderLineModal from "../../components/AddOrderLineModal";
import SplitOrderModal from "../../components/SplitOrderModal";

// One order on its own page: /orders/:id
export default function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [editingLine, setEditingLine] = useState(null);
  const [addingLine, setAddingLine] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [shipDate, setShipDate] = useState(null); // set = "mark shipped" dialog open

  const load = useCallback(
    () => Promise.all([ordersApi.get(id), ordersApi.history(id)])
      .then(([o, h]) => { setOrder(o); setHistory(h); })
      .catch((err) => setError(err.message)),
    [id]
  );

  useEffect(() => {
    load();
    Promise.all([productsApi.list(), warehousesApi.list()]).then(([p, w]) => { setProducts(p); setWarehouses(w); });
  }, [load]);

  async function changeStatus(newStatus, shippedAt) {
    try {
      const result = await ordersApi.updateStatus(order.id, newStatus);
      showShadowMessages(result?.shadowMessages);
      if (shippedAt) await ordersApi.updateShippedAt(order.id, shippedAt);
      message.success(`${order.orderNumber} marked ${ORDER_STATUS_LABELS[newStatus]}`);
      load();
    } catch (err) {
      message.error(`Failed to update status: ${err.message}`);
    }
  }

  function handleStatus(newStatus) {
    if (newStatus === "SHIPPED") {
      setShipDate(dayjs());
    } else if (order.status === "SHIPPED") {
      Modal.confirm({
        title: "Move off Shipped?",
        content: "This restores each line's quantity to on-hand stock, undoing the deduction made when it was shipped.",
        onOk: () => changeStatus(newStatus),
      });
    } else {
      changeStatus(newStatus);
    }
  }

  async function handlePackingList() {
    try {
      const { changes, messages } = await ordersApi.assignShadows([order.id]);
      showShadowMessages(messages);
      const fresh = changes.length ? await ordersApi.get(order.id) : order;
      await downloadPackingList(fresh);
      if (changes.length) load();
    } catch (err) {
      message.error(`Couldn't make packing list: ${err.message}`);
    }
  }

  async function handleDelete() {
    try {
      await ordersApi.delete(order.id);
      message.success(`${order.orderNumber} deleted`);
      navigate("/orders");
    } catch (err) {
      message.error(err.message);
    }
  }

  if (error) return <Alert type="error" message="Couldn't load this order" description={error} showIcon />;
  if (!order) return <Spin />;

  const open = order.status !== "SHIPPED" && order.status !== "CANCELLED";
  const totalUnits = order.lines.reduce((s, l) => s + l.quantity, 0);
  const totalCases = order.lines.reduce((s, l) => s + (l.casePack ? l.quantity / l.casePack : 0), 0);

  const columns = [
    {
      title: "SKU",
      dataIndex: "sku",
      render: (sku, line) => (
        <>
          <Link to={`/products/${encodeURIComponent(sku)}`}>{sku}</Link>
          {line.shadowOf && <Tag color="purple" style={{ marginLeft: 6 }}>shadow of {line.shadowOf}</Tag>}
        </>
      ),
    },
    { title: "Product", dataIndex: "productName" },
    { title: "Color", dataIndex: "color", render: (v) => v || "—" },
    {
      title: "Qty",
      dataIndex: "quantity",
      align: "right",
      render: (qty, line) => (line.casePack
        ? <span>{qty} <span style={{ color: "#888", fontSize: 12 }}>({(qty / line.casePack).toFixed(1).replace(/\.0$/, "")} cs)</span></span>
        : qty),
    },
    { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
    { title: "Ship Date", dataIndex: "shipDate" },
    { title: "Container #", dataIndex: "containerNumber", render: (v) => v || "—" },
    { title: "Carton Marking", dataIndex: "cartonMarking", render: (v) => v || "—" },
    { title: "Projection", dataIndex: "projection", render: (p) => (open ? <ProjectionTag projection={p} /> : null) },
    {
      title: "",
      key: "actions",
      render: (_, line) => (
        <Space>
          {line.shadowOf && open && (
            <Popconfirm
              title={`Switch this line to ${line.shadowOf}?`}
              okText="Switch"
              onConfirm={async () => {
                const parent = products.find((p) => p.sku === line.shadowOf);
                if (!parent) return message.error(`${line.shadowOf} not found`);
                try {
                  await skuGroupsApi.swapLine(order.id, line.id, parent.id);
                  load();
                } catch (err) {
                  message.error(err.message);
                }
              }}
            >
              <Button size="small">Switch to {line.shadowOf}</Button>
            </Popconfirm>
          )}
          <Button type="text" icon={<EditOutlined />} onClick={() => setEditingLine(line)} />
          {open && (
            <Popconfirm
              title="Remove this line?"
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                try {
                  await ordersApi.deleteLine(order.id, line.id);
                  load();
                } catch (err) {
                  message.error(err.message);
                }
              }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }} onClick={() => navigate(-1)}>
        Back
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Space align="center" wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>Order {order.orderNumber}</Typography.Title>
          <Tag color={ORDER_STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Tag>
        </Space>
        <Space wrap>
          <Select
            value={order.status}
            onChange={handleStatus}
            style={{ width: 150 }}
            options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
          />
          <Button icon={<FileExcelOutlined />} onClick={handlePackingList}>Packing list</Button>
          <Button icon={<MailOutlined />} onClick={() => setEmailOpen(true)}>Email</Button>
          {open && <Button icon={<ScissorOutlined />} onClick={() => setSplitOpen(true)}>Split</Button>}
          <Popconfirm title={`Delete ${order.orderNumber}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={handleDelete}>
            <Button danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="Customer">
            <Link to={`/customers?name=${encodeURIComponent(order.customer)}`}>{order.customer}</Link>
          </Descriptions.Item>
          <Descriptions.Item label="Customer PO #">{order.customerPo || "—"}</Descriptions.Item>
          <Descriptions.Item label="Order Date">{order.orderDate}</Descriptions.Item>
          <Descriptions.Item label="Cancel Date">
            <Space size={8} wrap>
              <CancelDateTag order={order} />
              <DatePicker
                size="small"
                allowClear
                placeholder="Set cancel date"
                value={order.cancelDate ? dayjs(order.cancelDate) : null}
                onChange={async (d) => {
                  try {
                    await ordersApi.updateCancelDate(order.id, d ? d.format("YYYY-MM-DD") : null);
                    load();
                  } catch (err) {
                    message.error(err.message);
                  }
                }}
              />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Shipment">
            {order.shipment
              ? <Link to={`/shipments/${order.shipment.id}`}>{order.shipment.shipmentNumber} · {dayjs(order.shipment.pickupDate).format("MMM D")}</Link>
              : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Shipped">{order.shippedAt || "—"}</Descriptions.Item>
          <Descriptions.Item label="Invoiced">{order.invoicedAt ? dayjs(order.invoicedAt).format("MMM D, YYYY") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Totals">{totalUnits} units{totalCases ? ` · ${Math.round(totalCases * 10) / 10} cases` : ""}</Descriptions.Item>
          <Descriptions.Item label="Notes" span={2}>{order.notes || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <OrderDocuments orderId={order.id} orderStatus={order.status} onChanged={load} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Lines</Typography.Title>
        {open && <Button icon={<PlusOutlined />} onClick={() => setAddingLine(true)}>Add line</Button>}
      </div>
      <Table rowKey="id" size="small" columns={columns} dataSource={order.lines} pagination={false} scroll={{ x: "max-content" }} />

      <OrderHistory changes={history} />

      <EditOrderLineModal
        open={!!editingLine}
        onClose={() => setEditingLine(null)}
        onUpdated={load}
        orderId={order.id}
        line={editingLine}
        warehouses={warehouses}
        products={products}
      />
      <AddOrderLineModal
        open={addingLine}
        onClose={() => setAddingLine(false)}
        onAdded={load}
        orderId={order.id}
        products={products}
        warehouses={warehouses}
      />
      <EmailOrderModal open={emailOpen} onClose={() => setEmailOpen(false)} order={order} />
      {splitOpen && <SplitOrderModal order={order} onClose={() => setSplitOpen(false)} onSplit={load} />}
      <Modal
        title={`Mark ${order.orderNumber} shipped`}
        open={!!shipDate}
        onCancel={() => setShipDate(null)}
        onOk={() => { const d = shipDate; setShipDate(null); changeStatus("SHIPPED", d?.format("YYYY-MM-DD")); }}
        okText="Mark shipped"
      >
        <Typography.Paragraph>Shipping takes each line&apos;s quantity out of its warehouse stock.</Typography.Paragraph>
        <span style={{ marginRight: 8 }}>Shipped on</span>
        <DatePicker value={shipDate} onChange={setShipDate} />
      </Modal>
    </>
  );
}

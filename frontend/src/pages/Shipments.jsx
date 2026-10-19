import { useEffect, useState, useCallback } from "react";
import {
  Table, Button, Tag, Spin, Alert, Typography, Space, Popconfirm, message,
  Modal, Form, DatePicker, Input, Select, Divider, Radio, Checkbox,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, EditOutlined, MinusCircleOutlined, FileExcelOutlined, ScissorOutlined, MergeCellsOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { shipmentsApi, ordersApi, warehousesApi } from "../api/inventory";
import { downloadShipmentPackingList, downloadShipmentPackingListPerOrder } from "../utils/packingList";
import { showShadowMessages } from "../utils/shadowMessages";
import BolModal from "../components/BolModal";

const STATUS_COLORS = { SCHEDULED: "blue", PICKED_UP: "green", DELIVERED: "purple" };
const STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PICKED_UP", label: "Picked Up" },
  { value: "DELIVERED", label: "Delivered" },
];

// Orders being added that are already Routed (usually on another shipment).
function alreadyRoutedOrders(orderIds, shipment, allOrders) {
  const current = new Set((shipment?.orders || []).map((o) => o.id));
  return allOrders.filter((o) => orderIds.includes(o.id) && !current.has(o.id) && o.status === "ROUTED");
}

function confirmRouted(orders, shipments) {
  const shipmentName = (id) => shipments.find((s) => s.id === id)?.shipmentNumber;
  return new Promise((resolve) => {
    Modal.confirm({
      title: orders.length === 1 ? "This order is already routed" : `${orders.length} orders are already routed`,
      content: (
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {orders.map((o) => (
            <li key={o.id}>
              {o.orderNumber} — {o.customer}
              {o.shipmentId && shipmentName(o.shipmentId) ? ` (on ${shipmentName(o.shipmentId)}, will move here)` : ""}
            </li>
          ))}
        </ul>
      ),
      okText: "Add anyway",
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function ShipmentModal({ open, onClose, onSaved, shipment, allOrders, allShipments, warehouses }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (shipment) {
        form.setFieldsValue({
          pickupDate: dayjs(shipment.pickupDate),
          carrier: shipment.carrier || "",
          csNumber: shipment.csNumber || "",
          status: shipment.status,
          notes: shipment.notes || "",
          warehouseId: shipment.warehouseId || undefined,
          orderIds: shipment.orders.map((o) => o.id),
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: "SCHEDULED", orderIds: [] });
      }
    }
  }, [open, shipment, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      const routed = alreadyRoutedOrders(values.orderIds || [], shipment, allOrders);
      if (routed.length > 0 && !(await confirmRouted(routed, allShipments))) return;
      setSaving(true);
      const payload = {
        pickupDate: values.pickupDate.toISOString(),
        carrier: values.carrier || null,
        csNumber: values.csNumber || null,
        status: values.status,
        notes: values.notes || null,
        warehouseId: values.warehouseId || null,
        orderIds: values.orderIds || [],
      };
      if (shipment) {
        const result = await shipmentsApi.update(shipment.id, payload);
        showShadowMessages(result?.shadowMessages);
        message.success("Shipment updated");
      } else {
        await shipmentsApi.create(payload);
        message.success("Shipment created");
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Only show orders that aren't SHIPPED/CANCELLED (or already on this shipment)
  const orderOptions = allOrders
    .filter((o) => {
      if (o.status === "CANCELLED") return false;
      if (o.status === "SHIPPED" && !shipment?.orders.find((s) => s.id === o.id)) return false;
      return true;
    })
    .map((o) => ({
      value: o.id,
      label: `${o.orderNumber} — ${o.customer}${o.customerPo ? ` (PO: ${o.customerPo})` : ""}${o.status === "ROUTED" ? " · Routed" : ""}`,
    }));

  return (
    <Modal
      title={shipment ? `Edit ${shipment.shipmentNumber}` : "New Shipment"}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText={shipment ? "Save" : "Create"}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="pickupDate" label="Pickup Date" rules={[{ required: true, message: "Required" }]}>
          <DatePicker showTime style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="carrier" label="Carrier">
          <Input placeholder="e.g. FedEx Freight" />
        </Form.Item>
        <Form.Item name="csNumber" label="CS #">
          <Input placeholder="Confirmation / tracking number" />
        </Form.Item>
        <Form.Item name="status" label="Status" rules={[{ required: true }]}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item
          name="warehouseId"
          label="Shipping From Warehouse"
          extra="Unassigned order lines will be auto-assigned to this warehouse when added to the shipment"
        >
          <Select
            placeholder="Select warehouse (optional)"
            allowClear
            options={(warehouses || []).map((w) => ({ value: w.id, label: w.name }))}
          />
        </Form.Item>
        <Divider />
        <Form.Item name="orderIds" label="Orders on this truck">
          <Select
            mode="multiple"
            placeholder="Select orders"
            options={orderOptions}
            filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [packingChoice, setPackingChoice] = useState(null); // { shipment, orders }
  const [selectedIds, setSelectedIds] = useState([]);
  const [combineKeepId, setCombineKeepId] = useState(null); // set = combine dialog open
  const [splitShipment, setSplitShipment] = useState(null);
  const [splitOrderIds, setSplitOrderIds] = useState([]);
  const [working, setWorking] = useState(false);
  const [bolShipment, setBolShipment] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([shipmentsApi.list(), ordersApi.list(), warehousesApi.list()])
      .then(([s, o, w]) => {
        setShipments(s);
        setAllOrders(o);
        setWarehouses(w);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedShipments = shipments.filter((s) => selectedIds.includes(s.id));

  function openCombine() {
    const earliest = [...selectedShipments].sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))[0];
    setCombineKeepId(earliest.id);
  }

  async function handleCombine() {
    setWorking(true);
    try {
      const kept = await shipmentsApi.combine(selectedIds, combineKeepId);
      message.success(`Combined into ${kept.shipmentNumber}`);
      setCombineKeepId(null);
      setSelectedIds([]);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function handleSplit() {
    setWorking(true);
    try {
      const created = await shipmentsApi.split(splitShipment.id, splitOrderIds);
      message.success(`Moved ${splitOrderIds.length} order${splitOrderIds.length > 1 ? "s" : ""} to ${created.shipmentNumber}`);
      setSplitShipment(null);
      setSplitOrderIds([]);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setWorking(false);
    }
  }

  // Right before a slip: put shadow-SKU lines on the SKU whose boxes will ship
  // (old stock first), then use the up-to-date orders.
  async function ordersReadyToShip(shipment) {
    const ids = shipment.orders.map((o) => o.id);
    const { changes, messages } = await ordersApi.assignShadows(ids);
    showShadowMessages(messages);
    let orders = allOrders;
    if (changes.length) {
      orders = await ordersApi.list();
      setAllOrders(orders);
    }
    return orders.filter((o) => ids.includes(o.id));
  }

  function handlePackingList(shipment) {
    if (shipment.orders.length === 0) {
      message.warning("Add orders to this shipment first");
      return;
    }
    if (shipment.orders.length === 1) {
      ordersReadyToShip(shipment)
        .then((orders) => downloadShipmentPackingList(shipment, orders))
        .catch((err) => message.error(`Couldn't make packing list: ${err.message}`));
      return;
    }
    setPackingChoice({ shipment, orderCount: shipment.orders.length });
  }

  async function handlePackingChoice(perOrder) {
    const { shipment } = packingChoice;
    setPackingChoice(null);
    try {
      const orders = await ordersReadyToShip(shipment);
      if (perOrder) await downloadShipmentPackingListPerOrder(shipment, orders);
      else await downloadShipmentPackingList(shipment, orders);
    } catch (err) {
      message.error(`Couldn't make packing list: ${err.message}`);
    }
  }

  async function handleDelete(id, shipmentNumber) {
    try {
      await shipmentsApi.delete(id);
      message.success(`${shipmentNumber} deleted`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  const columns = [
    { title: "Shipment #", dataIndex: "shipmentNumber", sorter: (a, b) => a.shipmentNumber.localeCompare(b.shipmentNumber) },
    {
      title: "Pickup Date",
      dataIndex: "pickupDate",
      render: (v) => dayjs(v).format("MMM D, YYYY h:mm A"),
      sorter: (a, b) => a.pickupDate.localeCompare(b.pickupDate),
    },
    { title: "From Warehouse", dataIndex: "warehouseName", render: (v) => v || "—" },
    { title: "Carrier", dataIndex: "carrier", render: (v) => v || "—" },
    { title: "CS #", dataIndex: "csNumber", render: (v) => v || "—" },
    {
      title: "Status",
      dataIndex: "status",
      render: (v) => <Tag color={STATUS_COLORS[v]}>{v.replace("_", " ")}</Tag>,
      filters: STATUS_OPTIONS.map((s) => ({ text: s.label, value: s.value })),
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Orders",
      dataIndex: "orders",
      render: (orders) => (
        <Space size={4} wrap>
          {orders.length === 0 ? "—" : orders.map((o) => <Tag key={o.id}>{o.orderNumber}</Tag>)}
        </Space>
      ),
    },
    {
      title: "",
      key: "actions",
      render: (_, shipment) => (
        <Space>
          <Button
            icon={<FileExcelOutlined />}
            type="text"
            title="Download packing list for all orders"
            onClick={() => handlePackingList(shipment)}
          />
          <Button
            icon={<FilePdfOutlined />}
            type="text"
            title="Bill of lading (BOL)"
            disabled={shipment.orders.length === 0}
            onClick={() => setBolShipment(shipment)}
          />
          {shipment.status === "SCHEDULED" && shipment.orders.length > 1 && (
            <Button
              icon={<ScissorOutlined />}
              type="text"
              title="Split into two shipments"
              onClick={() => { setSplitShipment(shipment); setSplitOrderIds([]); }}
            />
          )}
          <Button icon={<EditOutlined />} type="text" onClick={() => { setEditingShipment(shipment); setModalOpen(true); }} />
          <Popconfirm title={`Delete ${shipment.shipmentNumber}?`} onConfirm={() => handleDelete(shipment.id, shipment.shipmentNumber)}>
            <Button icon={<DeleteOutlined />} danger type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (error) return <Alert type="error" message="Failed to load shipments" description={error} showIcon />;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Shipments</Typography.Title>
        <Space>
          {selectedIds.length >= 2 && (
            <Button icon={<MergeCellsOutlined />} onClick={openCombine}>
              Combine {selectedIds.length} shipments
            </Button>
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingShipment(null); setModalOpen(true); }}>
            New Shipment
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={shipments}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: selectedIds,
          onChange: setSelectedIds,
          getCheckboxProps: (s) => ({ disabled: s.status !== "SCHEDULED", title: s.status !== "SCHEDULED" ? "Only Scheduled shipments can be combined" : undefined }),
        }}
        pagination={{ defaultPageSize: 15, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
        expandable={{
          expandedRowRender: (shipment) => (
            <div>
              <Typography.Text strong>Orders on this truck:</Typography.Text>
              {shipment.orders.length === 0 ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>None assigned</Typography.Text>
              ) : (
                <Table
                  size="small"
                  pagination={false}
                  style={{ marginTop: 8 }}
                  rowKey="id"
                  dataSource={shipment.orders}
                  columns={[
                    { title: "Order #", dataIndex: "orderNumber" },
                    { title: "Customer", dataIndex: "customer" },
                    { title: "Customer PO #", dataIndex: "customerPo", render: (v) => v || "—" },
                    { title: "Status", dataIndex: "status", render: (v) => <Tag>{v}</Tag> },
                    {
                      title: "",
                      key: "remove",
                      render: (_, order) => (
                        <Button
                          icon={<MinusCircleOutlined />}
                          type="text"
                          danger
                          size="small"
                          onClick={async () => {
                            await shipmentsApi.removeOrder(shipment.id, order.id);
                            load();
                          }}
                        />
                      ),
                    },
                  ]}
                />
              )}
              {shipment.notes && (
                <div style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary">Notes: {shipment.notes}</Typography.Text>
                </div>
              )}
            </div>
          ),
        }}
      />

      <ShipmentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingShipment(null); }}
        onSaved={load}
        shipment={editingShipment}
        allOrders={allOrders}
        allShipments={shipments}
        warehouses={warehouses}
      />

      {bolShipment && <BolModal key={bolShipment.id} shipment={bolShipment} onClose={() => setBolShipment(null)} />}

      <Modal
        title="Combine shipments"
        open={combineKeepId != null}
        onCancel={() => setCombineKeepId(null)}
        onOk={handleCombine}
        okText="Combine"
        confirmLoading={working}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          All orders move onto the shipment you keep. The others are deleted.
        </Typography.Paragraph>
        <Typography.Text strong>Keep:</Typography.Text>
        <Radio.Group
          value={combineKeepId}
          onChange={(e) => setCombineKeepId(e.target.value)}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
        >
          {selectedShipments.map((s) => (
            <Radio key={s.id} value={s.id}>
              <strong>{s.shipmentNumber}</strong> · {dayjs(s.pickupDate).format("MMM D, h:mm A")}
              {s.carrier ? ` · ${s.carrier}` : ""} · {s.orders.length} order{s.orders.length === 1 ? "" : "s"}
            </Radio>
          ))}
        </Radio.Group>
      </Modal>

      <Modal
        title={`Split ${splitShipment?.shipmentNumber ?? ""}`}
        open={!!splitShipment}
        onCancel={() => setSplitShipment(null)}
        onOk={handleSplit}
        okText="Move to new shipment"
        okButtonProps={{ disabled: splitOrderIds.length === 0 || splitOrderIds.length === splitShipment?.orders.length }}
        confirmLoading={working}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Pick the orders to move onto a new shipment. It gets the same pickup date, carrier and warehouse, which you can then edit.
        </Typography.Paragraph>
        <Checkbox.Group
          value={splitOrderIds}
          onChange={setSplitOrderIds}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          options={(splitShipment?.orders || []).map((o) => ({
            value: o.id,
            label: `${o.orderNumber} — ${o.customer}${o.customerPo ? ` (PO: ${o.customerPo})` : ""}`,
          }))}
        />
      </Modal>

      <Modal
        title={`Packing list — ${packingChoice?.shipment.shipmentNumber ?? ""}`}
        open={!!packingChoice}
        onCancel={() => setPackingChoice(null)}
        footer={null}
        width={420}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          This shipment has {packingChoice?.orderCount} orders. How do you want the packing list?
        </Typography.Paragraph>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button block type="primary" icon={<FileExcelOutlined />} onClick={() => handlePackingChoice(false)}>
            One sheet with all orders
          </Button>
          <Button block icon={<FileExcelOutlined />} onClick={() => handlePackingChoice(true)}>
            One sheet per order
          </Button>
        </div>
      </Modal>
    </Spin>
  );
}

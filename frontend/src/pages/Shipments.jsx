import { useEffect, useState, useCallback } from "react";
import {
  Table, Button, Tag, Spin, Alert, Typography, Space, Popconfirm, message,
  Modal, Form, DatePicker, Input, Select, Divider,
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, MinusCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { shipmentsApi, ordersApi } from "../api/inventory";

const STATUS_COLORS = { SCHEDULED: "blue", PICKED_UP: "green", DELIVERED: "purple" };
const STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PICKED_UP", label: "Picked Up" },
  { value: "DELIVERED", label: "Delivered" },
];

function ShipmentModal({ open, onClose, onSaved, shipment, allOrders }) {
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
      setSaving(true);
      const payload = {
        pickupDate: values.pickupDate.toISOString(),
        carrier: values.carrier || null,
        csNumber: values.csNumber || null,
        status: values.status,
        notes: values.notes || null,
        orderIds: values.orderIds || [],
      };
      if (shipment) {
        await shipmentsApi.update(shipment.id, payload);
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
      label: `${o.orderNumber} — ${o.customer}${o.customerPo ? ` (PO: ${o.customerPo})` : ""}`,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([shipmentsApi.list(), ordersApi.list()])
      .then(([s, o]) => {
        setShipments(s);
        setAllOrders(o);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingShipment(null); setModalOpen(true); }}>
          New Shipment
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={shipments}
        rowKey="id"
        pagination={{ pageSize: 15 }}
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
      />
    </Spin>
  );
}

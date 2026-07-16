import { useEffect, useState } from "react";
import { Modal, Form, Input, Select, Button, Space, Alert, Spin, message, Divider, Table, InputNumber, Typography } from "antd";
import { MailOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { emailsApi } from "../api/inventory";

const TYPES = [
  { value: "invoice", label: "Order Confirmation / Invoice" },
  { value: "routing", label: "Routing Instructions (to warehouse)" },
];

const COMPANIES = [
  { value: "Quality Silver Inc", label: "Quality Silver Inc" },
  { value: "Basic Trading Inc", label: "Basic Trading Inc" },
];

function initLines(order) {
  return (order?.lines || []).map((l, i) => ({
    key: i,
    description: l.productName || "",
    sku: l.sku || "",
    qty: l.quantity || 0,
    unitPrice: null,
  }));
}

function fmt(n) {
  if (n == null || n === "") return "";
  return `$${Number(n).toFixed(2)}`;
}

export default function EmailOrderModal({ open, onClose, order }) {
  const [form] = Form.useForm();
  const [type, setType] = useState("invoice");
  const [company, setCompany] = useState("Quality Silver Inc");
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [defaults, setDefaults] = useState(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    form.resetFields();
    setType("invoice");
    setCompany("Quality Silver Inc");
    setInvoiceLines(initLines(order));
    setDefaults(null);
    setLoadingDefaults(true);
    emailsApi
      .getOrderDefaults(order.id)
      .then((d) => {
        setDefaults(d);
        form.setFieldsValues({ to: d.customerEmail || "", notes: "" });
        form.setFieldValue("to", d.customerEmail || "");
      })
      .catch(() => {})
      .finally(() => setLoadingDefaults(false));
  }, [open, order]);

  useEffect(() => {
    if (!defaults) return;
    form.setFieldValue("to", type === "invoice" ? defaults.customerEmail || "" : defaults.warehouseEmail || "");
  }, [type, defaults]);

  function updateLine(key, field, value) {
    setInvoiceLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function addLine() {
    const key = Date.now();
    setInvoiceLines((prev) => [...prev, { key, description: "", sku: "", qty: 1, unitPrice: null }]);
  }

  function removeLine(key) {
    setInvoiceLines((prev) => prev.filter((l) => l.key !== key));
  }

  const subtotal = invoiceLines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0);

  const lineColumns = [
    {
      title: "Description",
      dataIndex: "description",
      width: 180,
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={(e) => updateLine(row.key, "description", e.target.value)}
        />
      ),
    },
    {
      title: "SKU",
      dataIndex: "sku",
      width: 100,
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={(e) => updateLine(row.key, "sku", e.target.value)}
        />
      ),
    },
    {
      title: "Qty",
      dataIndex: "qty",
      width: 70,
      render: (v, row) => (
        <InputNumber
          size="small"
          min={0}
          value={v}
          onChange={(val) => updateLine(row.key, "qty", val)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Unit Price",
      dataIndex: "unitPrice",
      width: 100,
      render: (v, row) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          prefix="$"
          value={v}
          onChange={(val) => updateLine(row.key, "unitPrice", val)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Total",
      width: 90,
      render: (_, row) => (
        <span style={{ fontSize: 12 }}>
          {row.unitPrice != null ? fmt((row.qty || 0) * (row.unitPrice || 0)) : "—"}
        </span>
      ),
    },
    {
      title: "",
      width: 32,
      render: (_, row) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={() => removeLine(row.key)}
        />
      ),
    },
  ];

  async function handleSend() {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSending(true);
    try {
      if (type === "invoice") {
        await emailsApi.sendInvoice({
          orderId: order.id,
          to: values.to,
          extraNotes: values.notes || undefined,
          company,
          lines: invoiceLines.map((l) => ({
            description: l.description,
            sku: l.sku,
            qty: l.qty,
            unitPrice: l.unitPrice,
          })),
        });
      } else {
        await emailsApi.sendRouting({ orderId: order.id, to: values.to, notes: values.notes || undefined });
      }
      message.success(`Email sent to ${values.to}`);
      onClose();
    } catch (err) {
      message.error(`Failed to send: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  if (!order) return null;

  return (
    <Modal
      title={<><MailOutlined style={{ marginRight: 8 }} />Email — {order.orderNumber}</>}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={760}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" icon={<MailOutlined />} loading={sending} onClick={handleSend}>
            Send
          </Button>
        </Space>
      }
    >
      <Spin spinning={loadingDefaults}>
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Space style={{ width: "100%" }} styles={{ item: { flex: 1 } }}>
            <Form.Item label="Email type" style={{ flex: 1, marginBottom: 12 }}>
              <Select value={type} onChange={setType} options={TYPES} style={{ width: "100%" }} />
            </Form.Item>
            {type === "invoice" && (
              <Form.Item label="Billing company" style={{ flex: 1, marginBottom: 12 }}>
                <Select value={company} onChange={setCompany} options={COMPANIES} style={{ width: "100%" }} />
              </Form.Item>
            )}
          </Space>

          {type === "routing" && defaults?.warehouseName && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`Sending to warehouse: ${defaults.warehouseName}`} />
          )}
          {type === "invoice" && !defaults?.customerEmail && !loadingDefaults && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message="No email found for this customer in CRM contacts — enter one manually below." />
          )}

          <Form.Item
            name="to"
            label="To"
            style={{ marginBottom: 12 }}
            rules={[{ required: true, message: "Required" }, { type: "email", message: "Must be a valid email" }]}
          >
            <Input placeholder="email@example.com" />
          </Form.Item>

          <Form.Item name="notes" label={type === "invoice" ? "Additional notes (optional)" : "Routing notes (optional)"} style={{ marginBottom: 12 }}>
            <Input.TextArea rows={2} placeholder={type === "routing" ? "Pickup instructions, contact info, dock number…" : "Any extra info to include in the email…"} />
          </Form.Item>

          {type === "invoice" && (
            <>
              <Divider style={{ margin: "12px 0" }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Invoice Lines — edit before sending</Typography.Text>
              </Divider>

              <Table
                size="small"
                dataSource={invoiceLines}
                columns={lineColumns}
                pagination={false}
                rowKey="key"
                style={{ marginBottom: 8 }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Button size="small" icon={<PlusOutlined />} onClick={addLine}>Add line</Button>
                <div style={{ textAlign: "right", fontSize: 13 }}>
                  <div style={{ color: "#888" }}>Subtotal: <strong>{fmt(subtotal) || "—"}</strong></div>
                  <div style={{ color: "#888" }}>Discount: <strong>—</strong></div>
                  <div style={{ fontSize: 14 }}>Balance Due: <strong>{fmt(subtotal) || "—"}</strong></div>
                </div>
              </div>
            </>
          )}
        </Form>
      </Spin>
    </Modal>
  );
}

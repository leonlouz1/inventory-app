import { useEffect, useState } from "react";
import { Modal, Form, Input, Select, Button, Space, Alert, Spin, message, Divider } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { emailsApi } from "../api/inventory";

const TYPES = [
  { value: "invoice", label: "Order Confirmation / Invoice" },
  { value: "routing", label: "Routing Instructions (to warehouse)" },
];

export default function EmailOrderModal({ open, onClose, order }) {
  const [form] = Form.useForm();
  const [type, setType] = useState("invoice");
  const [company, setCompany] = useState("Quality Silver Inc");
  const [defaults, setDefaults] = useState(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    form.resetFields();
    setType("invoice");
    setCompany("Quality Silver Inc");
    setDefaults(null);
    setLoadingDefaults(true);
    emailsApi
      .getOrderDefaults(order.id)
      .then((d) => {
        setDefaults(d);
        form.setFieldsValue({ to: d.customerEmail || "", notes: "" });
      })
      .catch(() => {})
      .finally(() => setLoadingDefaults(false));
  }, [open, order]);

  useEffect(() => {
    if (!defaults) return;
    if (type === "invoice") {
      form.setFieldValue("to", defaults.customerEmail || "");
    } else {
      form.setFieldValue("to", defaults.warehouseEmail || "");
    }
  }, [type, defaults]);

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
        await emailsApi.sendInvoice({ orderId: order.id, to: values.to, extraNotes: values.notes || undefined, company });
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
          <Form.Item label="Email type">
            <Select value={type} onChange={setType} options={TYPES} style={{ width: "100%" }} />
          </Form.Item>

          {type === "invoice" && (
            <Form.Item label="Billing company">
              <Select
                value={company}
                onChange={setCompany}
                style={{ width: "100%" }}
                options={[
                  { value: "Quality Silver Inc", label: "Quality Silver Inc" },
                  { value: "Basic Trading Inc", label: "Basic Trading Inc" },
                ]}
              />
            </Form.Item>
          )}

          {type === "routing" && defaults?.warehouseName && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={`Sending to warehouse: ${defaults.warehouseName}`}
            />
          )}
          {type === "invoice" && !defaults?.customerEmail && !loadingDefaults && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="No email found for this customer in CRM contacts — enter one manually below."
            />
          )}

          <Form.Item
            name="to"
            label="To"
            rules={[
              { required: true, message: "Required" },
              { type: "email", message: "Must be a valid email" },
            ]}
          >
            <Input placeholder="email@example.com" />
          </Form.Item>

          <Form.Item name="notes" label={type === "invoice" ? "Additional notes (optional)" : "Routing notes (optional)"}>
            <Input.TextArea rows={3} placeholder={type === "routing" ? "Pickup instructions, contact info, dock number…" : "Any extra info to include in the email…"} />
          </Form.Item>

          <Divider style={{ margin: "12px 0" }} />
          <div style={{ color: "#888", fontSize: 12 }}>
            <strong>Order:</strong> {order.orderNumber} &nbsp;·&nbsp;
            <strong>Customer:</strong> {order.customer} &nbsp;·&nbsp;
            <strong>Lines:</strong> {order.lines?.length ?? "—"}
          </div>
        </Form>
      </Spin>
    </Modal>
  );
}

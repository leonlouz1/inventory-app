import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Spin, Alert, Typography, Button, Tag, Space, Form, Input, Select,
  Modal, Popconfirm, message, Row, Col, Card, Timeline,
} from "antd";
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  PhoneOutlined, MailOutlined, UserOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { crmApi } from "../../api/inventory";

dayjs.extend(relativeTime);

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const STATUSES = [
  "Active", "Order Placed", "Warm", "Not Contacted",
  "No Response", "Not Interested", "No Contact Found",
];
const STATUS_COLORS = {
  "Active": "green", "Order Placed": "blue", "Warm": "orange",
  "Not Contacted": "default", "No Response": "purple",
  "Not Interested": "red", "No Contact Found": "default",
};
const CONTACT_TYPES = ["Call", "Email", "Meeting", "Follow-up", "Sent Samples", "Sent Linesheet", "Sent ATS", "Other"];

function LogContactModal({ open, onClose, onSaved, retailerId }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ date: dayjs().format("YYYY-MM-DD"), actionTaken: "Call" });
    }
  }, [open, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await crmApi.createActivity({
        retailerId,
        date: values.date,
        actionTaken: values.actionTaken,
        notes: values.notes || null,
        nextStep: values.nextStep || null,
      });
      message.success("Contact logged");
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Log Contact" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={saving} destroyOnHidden width={440}>
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="actionTaken" label="Type" rules={[{ required: true }]}>
              <Select options={CONTACT_TYPES.map((t) => ({ value: t, label: t }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} placeholder="What happened? What did they say?" />
        </Form.Item>
        <Form.Item name="nextStep" label="Next step (optional)">
          <Input placeholder="e.g. Follow up in 2 weeks" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ContactModal({ open, onClose, onSaved, contact, retailerId }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) { form.resetFields(); if (contact) form.setFieldsValue(contact); }
  }, [open, contact, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      if (contact) await crmApi.updateContact(contact.id, values);
      else await crmApi.createContact({ ...values, retailerId });
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  }

  return (
    <Modal title={contact ? "Edit Contact" : "Add Contact"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={500}>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={14}><Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={10}><Form.Item name="title" label="Title"><Input /></Form.Item></Col>
        </Row>
        <Form.Item name="category" label="Category">
          <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="Category they buy" />
        </Form.Item>
        <Form.Item name="email" label="Email"><Input /></Form.Item>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="directPhone" label="Direct"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="mobilePhone" label="Mobile"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="hqPhone" label="HQ"><Input /></Form.Item></Col>
        </Row>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

export default function CrmAccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [retailer, setRetailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const [contactModal, setContactModal] = useState({ open: false, contact: null });

  const load = useCallback(() => {
    setLoading(true);
    return crmApi.getRetailer(id)
      .then(setRetailer)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCategoryUpdate(category, field, value) {
    try {
      await crmApi.updateCategory(retailer.id, { category, [field]: value });
      setRetailer((prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.category === category ? { ...c, [field]: value } : c
        ),
      }));
    } catch (err) {
      message.error(err.message);
    }
  }

  async function addCategory(category) {
    try {
      await crmApi.updateCategory(retailer.id, { category, status: "Not Contacted" });
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function deleteCategory(category) {
    try {
      await crmApi.deleteCategory(retailer.id, category);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function deleteContact(contactId) {
    try {
      await crmApi.deleteContact(contactId);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function deleteActivity(activityId) {
    try {
      await crmApi.deleteActivity(activityId);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (loading) return <Spin spinning style={{ display: "block", marginTop: 80 }} />;
  if (error) return <Alert type="error" message={error} showIcon />;
  if (!retailer) return null;

  const existingCategories = new Set(retailer.categories.map((c) => c.category));
  const missingCategories = CRM_CATEGORIES.filter((c) => !existingCategories.has(c));

  const timelineItems = (retailer.activityLogs || []).map((a) => ({
    key: a.id,
    color: a.actionTaken?.toLowerCase().includes("call") ? "blue"
      : a.actionTaken?.toLowerCase().includes("email") ? "green"
      : a.actionTaken?.toLowerCase().includes("meeting") ? "purple"
      : "gray",
    children: (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong>{a.actionTaken}</strong>
          {a.notes && <div style={{ color: "#555", marginTop: 2 }}>{a.notes}</div>}
          {a.nextStep && <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>↳ Next: {a.nextStep}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 16 }}>
          <span style={{ color: "#aaa", fontSize: 12, whiteSpace: "nowrap" }}>{a.date} · {dayjs(a.date).fromNow()}</span>
          <Popconfirm title="Delete this log?" onConfirm={() => deleteActivity(a.id)}>
            <Button type="text" icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </div>
      </div>
    ),
  }));

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/crm/accounts")} type="text" />
          <Typography.Title level={4} style={{ margin: 0 }}>{retailer.name}</Typography.Title>
          {retailer.type && <Tag>{retailer.type}</Tag>}
          {retailer.priority && (
            <Tag color={retailer.priority === "3 - High" ? "red" : retailer.priority === "2 - Medium" ? "orange" : "default"}>
              {retailer.priority}
            </Tag>
          )}
        </Space>
        <Button type="primary" icon={<ClockCircleOutlined />} onClick={() => setLogOpen(true)}>
          Log Contact
        </Button>
      </div>

      <Row gutter={24}>
        <Col span={14}>
          <Card size="small" title="Categories & Status" style={{ marginBottom: 16 }}>
            {retailer.categories.length === 0 && (
              <Typography.Text type="secondary">No categories yet.</Typography.Text>
            )}
            {retailer.categories.map((cat) => (
              <div key={cat.category} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 70, fontWeight: 500, flexShrink: 0 }}>{cat.category}</span>
                <Select
                  size="small"
                  value={cat.status}
                  style={{ width: 165 }}
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                  onChange={(val) => handleCategoryUpdate(cat.category, "status", val)}
                  labelRender={() => <Tag color={STATUS_COLORS[cat.status]} style={{ margin: 0 }}>{cat.status}</Tag>}
                />
                <Input
                  size="small"
                  placeholder="Buyer name"
                  defaultValue={cat.buyerName || ""}
                  style={{ flex: 1 }}
                  onBlur={(e) => {
                    if (e.target.value !== (cat.buyerName || ""))
                      handleCategoryUpdate(cat.category, "buyerName", e.target.value);
                  }}
                />
                <Popconfirm title={`Remove ${cat.category}?`} onConfirm={() => deleteCategory(cat.category)}>
                  <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                </Popconfirm>
              </div>
            ))}
            {missingCategories.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Select
                  size="small"
                  placeholder="+ Add category"
                  style={{ width: 160 }}
                  options={missingCategories.map((c) => ({ value: c, label: c }))}
                  value={null}
                  onChange={addCategory}
                />
              </div>
            )}
          </Card>

          <Card
            size="small"
            title="Activity"
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setLogOpen(true)}>Log</Button>}
          >
            {timelineItems.length === 0
              ? <Typography.Text type="secondary">No activity logged yet — hit "Log Contact" to start.</Typography.Text>
              : <Timeline items={timelineItems} style={{ marginTop: 12 }} />
            }
          </Card>
        </Col>

        <Col span={10}>
          <Card
            size="small"
            title="Contacts"
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => setContactModal({ open: true, contact: null })}>Add</Button>}
            style={{ marginBottom: 16 }}
          >
            {retailer.contacts.length === 0
              ? <Typography.Text type="secondary">No contacts yet.</Typography.Text>
              : retailer.contacts.map((c, i) => (
                <div key={c.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < retailer.contacts.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}><UserOutlined style={{ marginRight: 6 }} />{c.name}</div>
                      {c.title && <div style={{ color: "#888", fontSize: 12 }}>{c.title}</div>}
                      {c.category && <Tag style={{ marginTop: 4 }} color="blue">{c.category}</Tag>}
                    </div>
                    <Space size={4}>
                      <Button type="text" icon={<EditOutlined />} size="small"
                        onClick={() => setContactModal({ open: true, contact: c })} />
                      <Popconfirm title="Delete contact?" onConfirm={() => deleteContact(c.id)}>
                        <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                      </Popconfirm>
                    </Space>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {(c.directPhone || c.mobilePhone || c.hqPhone) && (
                      <div><PhoneOutlined style={{ marginRight: 6, color: "#888" }} />{c.directPhone || c.mobilePhone || c.hqPhone}</div>
                    )}
                    {c.email && (
                      <div><MailOutlined style={{ marginRight: 6, color: "#888" }} />
                        <a href={`mailto:${c.email}`}>{c.email}</a>
                      </div>
                    )}
                    {c.notes && <div style={{ color: "#888", marginTop: 4, fontSize: 12 }}>{c.notes}</div>}
                  </div>
                </div>
              ))
            }
          </Card>

          {retailer.notes && (
            <Card size="small" title="Notes">
              <Typography.Text>{retailer.notes}</Typography.Text>
            </Card>
          )}
        </Col>
      </Row>

      <LogContactModal open={logOpen} onClose={() => setLogOpen(false)} onSaved={load} retailerId={retailer.id} />
      <ContactModal
        open={contactModal.open}
        contact={contactModal.contact}
        retailerId={retailer.id}
        onClose={() => setContactModal({ open: false, contact: null })}
        onSaved={load}
      />
    </div>
  );
}

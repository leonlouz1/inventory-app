import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Spin, Alert, Typography, Button, Table, Tag, Space, Form,
  Input, Select, DatePicker, Modal, Popconfirm, message, Row, Col, Card, Timeline,
} from "antd";
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ArrowLeftOutlined,
  CloseOutlined, PhoneOutlined, MailOutlined, CheckOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { crmApi } from "../../api/inventory";

dayjs.extend(relativeTime);

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];

const STATUSES = [
  "Active", "Order Placed", "Warm", "Following Up",
  "Reached Out", "Not Contacted", "No Response", "Not Interested",
];

const STATUS_COLORS = {
  "Active": "green", "Order Placed": "blue", "Warm": "orange",
  "Following Up": "gold", "Reached Out": "cyan",
  "Not Contacted": "default", "No Response": "purple", "Not Interested": "red",
};

const ACTION_OPTIONS = [
  "Called - reached", "Called - no answer", "Email sent", "Meeting",
  "Sent linesheet", "Sent ATS", "Sent samples", "Sent catalog",
  "Sent proposal", "Follow-up", "Other",
];

// ── Quick Log Contact Modal ─────────────────────────────────────────────────
function LogContactModal({ open, onClose, onSaved, retailerId, log }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (log) {
        form.setFieldsValue({ ...log, date: log.date ? dayjs(log.date) : dayjs(), nextStepDate: log.nextStepDate ? dayjs(log.nextStepDate) : null });
      } else {
        form.setFieldsValue({ date: dayjs() });
      }
    }
  }, [open, log, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        date: values.date?.format("YYYY-MM-DD"),
        nextStepDate: values.nextStepDate?.format("YYYY-MM-DD") || null,
      };
      if (log) {
        await crmApi.updateActivity(log.id, payload);
      } else {
        await crmApi.createActivity({ ...payload, retailerId });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  }

  return (
    <Modal title={log ? "Edit Activity" : "Log Contact"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={480}>
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="category" label="Category (optional)">
              <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="All" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="actionTaken" label="What did you do?" rules={[{ required: true }]}>
          <Select options={ACTION_OPTIONS.map((a) => ({ value: a, label: a }))} placeholder="Select action" />
        </Form.Item>
        <Form.Item name="rep" label="Rep">
          <Input placeholder="Your name" />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Any details, responses, or context…" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="nextStep" label="Next step">
              <Input placeholder="e.g. Follow up in 2 weeks" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="nextStepDate" label="Follow-up date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// ── Contact Modal ───────────────────────────────────────────────────────────
function ContactModal({ open, onClose, onSaved, contact, retailerId }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) { form.resetFields(); if (contact) form.setFieldsValue(contact); }
  }, [open, contact, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      if (contact) {
        await crmApi.updateContact(contact.id, values);
      } else {
        await crmApi.createContact({ ...values, retailerId });
      }
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
        <Row gutter={12}>
          <Col span={12}><Form.Item name="category" label="Category">
            <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="All categories" />
          </Form.Item></Col>
          <Col span={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="directPhone" label="Direct #"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="mobilePhone" label="Mobile #"><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="hqPhone" label="HQ #"><Input /></Form.Item></Col>
        </Row>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function CrmAccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [retailer, setRetailer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logModal, setLogModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [contactModal, setContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const load = useCallback(() =>
    crmApi.getRetailer(id)
      .then(setRetailer)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false)), [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCategoryUpdate(category, field, value) {
    await crmApi.updateCategory(Number(id), { category, [field]: value });
    setRetailer((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => c.category === category ? { ...c, [field]: value } : c),
    }));
  }

  if (error) return <Alert type="error" message={error} showIcon />;
  if (!retailer && !loading) return <Alert type="warning" message="Account not found" />;

  const activityLogs = [...(retailer?.activityLogs || [])].sort((a, b) => b.date.localeCompare(a.date));
  const pendingFollowUps = activityLogs.filter((l) => l.nextStepDate && !l.done && dayjs(l.nextStepDate).isBefore(dayjs(), "day"));

  return (
    <Spin spinning={loading}>
      {retailer && (
        <div style={{ maxWidth: 900 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate("/crm/accounts")} />
            <Typography.Title level={4} style={{ margin: 0 }}>{retailer.name}</Typography.Title>
            {retailer.type && <Tag>{retailer.type}</Tag>}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { setEditingLog(null); setLogModal(true); }}
              style={{ marginLeft: "auto" }}
            >
              Log Contact
            </Button>
          </div>

          {/* Overdue follow-ups banner */}
          {pendingFollowUps.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`${pendingFollowUps.length} overdue follow-up${pendingFollowUps.length > 1 ? "s" : ""}`}
              description={pendingFollowUps.map((l) => `${l.nextStep || l.actionTaken} (due ${dayjs(l.nextStepDate).format("MMM D")})`).join(" · ")}
            />
          )}

          {/* Category cards */}
          <div style={{ marginBottom: 20 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>CATEGORIES</Typography.Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CRM_CATEGORIES.filter((cat) => retailer.categories.find((x) => x.category === cat)).map((cat) => {
                const c = retailer.categories.find((x) => x.category === cat);
                return (
                  <Card
                    key={cat}
                    size="small"
                    style={{ minWidth: 155, flex: "0 0 auto" }}
                    title={<span style={{ fontSize: 12 }}>{cat}</span>}
                    extra={
                      <Popconfirm title={`Remove ${cat}?`} onConfirm={async () => {
                        await crmApi.deleteCategory(retailer.id, cat);
                        setRetailer((prev) => ({ ...prev, categories: prev.categories.filter((x) => x.category !== cat) }));
                      }}>
                        <Button type="text" size="small" icon={<CloseOutlined />} danger />
                      </Popconfirm>
                    }
                  >
                    <Select
                      size="small"
                      value={c.status}
                      style={{ width: "100%", marginBottom: 6 }}
                      options={STATUSES.map((s) => ({ value: s, label: s }))}
                      onChange={(val) => handleCategoryUpdate(cat, "status", val)}
                      labelRender={() => <Tag color={STATUS_COLORS[c.status]} style={{ margin: 0 }}>{c.status}</Tag>}
                    />
                    <Input
                      size="small"
                      placeholder="Buyer name"
                      defaultValue={c.buyerName || ""}
                      onBlur={(e) => {
                        if (e.target.value !== (c.buyerName || "")) handleCategoryUpdate(cat, "buyerName", e.target.value);
                      }}
                    />
                  </Card>
                );
              })}
              {/* Add missing category */}
              {CRM_CATEGORIES.filter((cat) => !retailer.categories.find((x) => x.category === cat)).length > 0 && (
                <Select
                  placeholder="+ Add category"
                  style={{ width: 155, alignSelf: "center" }}
                  options={CRM_CATEGORIES
                    .filter((cat) => !retailer.categories.find((x) => x.category === cat))
                    .map((c) => ({ value: c, label: c }))}
                  onChange={async (cat) => {
                    await crmApi.updateCategory(retailer.id, { category: cat, status: "Not Contacted" });
                    setRetailer((prev) => ({ ...prev, categories: [...prev.categories, { category: cat, status: "Not Contacted", buyerName: null }] }));
                  }}
                  value={null}
                />
              )}
            </div>
          </div>

          <Row gutter={24}>
            {/* Activity timeline */}
            <Col span={14}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>ACTIVITY HISTORY</Typography.Text>
              </div>
              {activityLogs.length === 0 ? (
                <div style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                  No activity yet — hit Log Contact to add the first one.
                </div>
              ) : (
                <Timeline
                  items={activityLogs.map((l) => ({
                    key: l.id,
                    color: l.done ? "green" : "blue",
                    children: (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <strong style={{ fontSize: 13 }}>{l.actionTaken}</strong>
                            {l.category && <Tag style={{ marginLeft: 6, fontSize: 11 }}>{l.category}</Tag>}
                            {l.rep && <span style={{ color: "#aaa", fontSize: 11, marginLeft: 6 }}>{l.rep}</span>}
                          </div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingLog(l); setLogModal(true); }} />
                            <Popconfirm title="Delete?" onConfirm={async () => { await crmApi.deleteActivity(l.id); load(); }}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          </div>
                        </div>
                        <div style={{ color: "#888", fontSize: 12 }}>{dayjs(l.date).format("MMM D, YYYY")} · {dayjs(l.date).fromNow()}</div>
                        {l.notes && <div style={{ fontSize: 12, marginTop: 2 }}>{l.notes}</div>}
                        {l.nextStep && (
                          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: l.done ? "#52c41a" : (l.nextStepDate && dayjs(l.nextStepDate).isBefore(dayjs(), "day") ? "#cf1322" : "#1677ff") }}>
                              → {l.nextStep}
                              {l.nextStepDate && ` (${dayjs(l.nextStepDate).format("MMM D")})`}
                            </span>
                            {!l.done && (
                              <Button
                                size="small" type="text" icon={<CheckOutlined />}
                                style={{ color: "#52c41a", padding: 0, height: "auto", fontSize: 11 }}
                                onClick={async () => { await crmApi.updateActivity(l.id, { done: true }); load(); }}
                              >
                                Done
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ),
                  }))}
                />
              )}
            </Col>

            {/* Contacts */}
            <Col span={10}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>CONTACTS</Typography.Text>
                <Button size="small" icon={<PlusOutlined />} onClick={() => { setEditingContact(null); setContactModal(true); }}>
                  Add
                </Button>
              </div>
              {(retailer.contacts || []).length === 0 ? (
                <div style={{ color: "#aaa", fontSize: 13 }}>No contacts yet.</div>
              ) : (
                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  {retailer.contacts.map((c) => (
                    <Card key={c.id} size="small" style={{ fontSize: 13 }}
                      extra={
                        <Space size={2}>
                          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingContact(c); setContactModal(true); }} />
                          <Popconfirm title="Delete contact?" onConfirm={async () => { await crmApi.deleteContact(c.id); load(); }}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      }
                    >
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      {c.title && <div style={{ color: "#888", fontSize: 12 }}>{c.title}{c.category ? ` · ${c.category}` : ""}</div>}
                      {(c.directPhone || c.mobilePhone || c.hqPhone) && (
                        <div style={{ marginTop: 4 }}>
                          <PhoneOutlined style={{ marginRight: 4, color: "#888" }} />
                          {c.directPhone || c.mobilePhone || c.hqPhone}
                        </div>
                      )}
                      {c.email && (
                        <div>
                          <MailOutlined style={{ marginRight: 4, color: "#888" }} />
                          <a href={`mailto:${c.email}`}>{c.email}</a>
                        </div>
                      )}
                      {c.notes && <div style={{ color: "#888", fontSize: 12, marginTop: 4 }}>{c.notes}</div>}
                    </Card>
                  ))}
                </Space>
              )}
            </Col>
          </Row>
        </div>
      )}

      <LogContactModal
        open={logModal}
        onClose={() => { setLogModal(false); setEditingLog(null); }}
        onSaved={load}
        log={editingLog}
        retailerId={Number(id)}
      />
      <ContactModal
        open={contactModal}
        onClose={() => { setContactModal(false); setEditingContact(null); }}
        onSaved={load}
        contact={editingContact}
        retailerId={Number(id)}
      />
    </Spin>
  );
}

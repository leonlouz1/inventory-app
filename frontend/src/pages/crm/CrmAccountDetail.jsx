import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Spin, Alert, Typography, Tabs, Button, Table, Tag, Space, Form,
  Input, Select, DatePicker, Modal, Popconfirm, message, Row, Col, Card, Checkbox,
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const STATUSES = [
  "Active", "Order Placed", "Warm", "Not Contacted",
  "No Response", "Not Interested", "No Contact Found", "N/A",
];
const STATUS_COLORS = {
  "Active": "green", "Order Placed": "blue", "Warm": "orange",
  "Not Contacted": "default", "No Response": "purple",
  "Not Interested": "red", "No Contact Found": "default", "N/A": "default",
};
const ACTION_OPTIONS = [
  "Called - reached", "Called - NA", "Email sent", "Meeting", "Follow-up", "Other",
];
const ITEM_OPTIONS = ["Linesheet", "ATS", "Samples", "Follow-up", "Proposal", "Other"];
const RESPONSE_OPTIONS = ["Interested", "No response", "Not Interested", "Requested more info"];

function ContactModal({ open, onClose, onSaved, contact, retailerId }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (contact) form.setFieldsValue({ ...contact });
    }
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
    <Modal title={contact ? "Edit Contact" : "Add Contact"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={520}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="title" label="Title / Dept"><Input /></Form.Item>
        <Form.Item name="category" label="Category">
          <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="Select category" />
        </Form.Item>
        <Form.Item name="email" label="Email"><Input /></Form.Item>
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

function ActivityModal({ open, onClose, onSaved, log, retailerId }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (log) {
        form.setFieldsValue({
          ...log,
          date: log.date ? dayjs(log.date) : null,
          nextStepDate: log.nextStepDate ? dayjs(log.nextStepDate) : null,
        });
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
    <Modal title={log ? "Edit Activity" : "Log Activity"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={520}>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="category" label="Category">
              <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="All categories" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="actionTaken" label="Action Taken" rules={[{ required: true }]}>
              <Select options={ACTION_OPTIONS.map((a) => ({ value: a, label: a }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="rep" label="Rep"><Input /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="nextStep" label="Next Step"><Input /></Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="nextStepDate" label="Next Step Date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

function SentModal({ open, onClose, onSaved, item, retailerId }) {
  const [form] = Form.useForm();
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (item) {
        form.setFieldsValue({
          ...item,
          dateSent: item.dateSent ? dayjs(item.dateSent) : null,
          followUpDate: item.followUpDate ? dayjs(item.followUpDate) : null,
        });
      } else {
        form.setFieldsValue({ dateSent: dayjs() });
      }
    }
  }, [open, item, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        dateSent: values.dateSent?.format("YYYY-MM-DD"),
        followUpDate: values.followUpDate?.format("YYYY-MM-DD") || null,
      };
      if (item) {
        await crmApi.updateSent(item.id, payload);
      } else {
        await crmApi.createSent({ ...payload, retailerId });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  }

  return (
    <Modal title={item ? "Edit Sent Item" : "Log Sent Item"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={520}>
      <Form form={form} layout="vertical">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="dateSent" label="Date Sent" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="category" label="Category">
              <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="Select category" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="itemSent" label="Item Sent" rules={[{ required: true }]}>
              <Select options={ITEM_OPTIONS.map((i) => ({ value: i, label: i }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="buyerName" label="Buyer Name"><Input /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="responseReceived" label="Response">
              <Select options={RESPONSE_OPTIONS.map((r) => ({ value: r, label: r }))} allowClear placeholder="No response yet" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="followUpDate" label="Follow-up Date">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
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
  const [contactModal, setContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [activityModal, setActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [sentModal, setSentModal] = useState(false);
  const [editingSent, setEditingSent] = useState(null);

  const load = useCallback(() => {
    return crmApi.getRetailer(id)
      .then(setRetailer)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleCategoryUpdate(category, field, value) {
    await crmApi.updateCategory(Number(id), { category, [field]: value });
    setRetailer((prev) => ({
      ...prev,
      categories: prev.categories.map((c) =>
        c.category === category ? { ...c, [field]: value } : c
      ),
    }));
  }

  if (error) return <Alert type="error" message={error} showIcon />;
  if (!retailer && !loading) return <Alert type="warning" message="Retailer not found" />;

  const today = dayjs();

  return (
    <Spin spinning={loading}>
      {retailer && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate("/crm/accounts")} />
            <Typography.Title level={4} style={{ margin: 0 }}>{retailer.name}</Typography.Title>
            <Tag>{retailer.type || "—"}</Tag>
            <Tag color={retailer.priority === "3 - High" ? "red" : retailer.priority === "2 - Medium" ? "orange" : "default"}>
              {retailer.priority}
            </Tag>
          </div>

          {/* Category status grid */}
          <Row gutter={10} style={{ marginBottom: 20 }}>
            {CRM_CATEGORIES.map((cat) => {
              const c = retailer.categories.find((x) => x.category === cat) || null;
              return (
                <Col key={cat} flex="1">
                  <Card
                    size="small"
                    title={cat}
                    style={{ minWidth: 130, opacity: c ? 1 : 0.45 }}
                  >
                    <Select
                      size="small"
                      value={c?.status ?? null}
                      placeholder="N/A"
                      style={{ width: "100%", marginBottom: 6 }}
                      options={STATUSES.map((s) => ({ value: s, label: s }))}
                      onChange={(val) => handleCategoryUpdate(cat, "status", val)}
                      labelRender={() =>
                        c ? (
                          <Tag color={STATUS_COLORS[c.status]} style={{ margin: 0 }}>{c.status}</Tag>
                        ) : (
                          <Tag color="default" style={{ margin: 0 }}>N/A</Tag>
                        )
                      }
                    />
                    <Input
                      size="small"
                      placeholder="Buyer name"
                      defaultValue={c?.buyerName || ""}
                      disabled={!c}
                      onBlur={(e) => {
                        if (c && e.target.value !== (c.buyerName || "")) {
                          handleCategoryUpdate(cat, "buyerName", e.target.value);
                        }
                      }}
                    />
                  </Card>
                </Col>
              );
            })}
          </Row>

          <Tabs
            items={[
              {
                key: "contacts",
                label: `Contacts (${retailer.contacts?.length ?? 0})`,
                children: (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Button icon={<PlusOutlined />} size="small" onClick={() => { setEditingContact(null); setContactModal(true); }}>
                        Add Contact
                      </Button>
                    </div>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={false}
                      dataSource={retailer.contacts || []}
                      columns={[
                        { title: "Name", dataIndex: "name" },
                        { title: "Title", dataIndex: "title", render: (v) => v || "—" },
                        { title: "Category", dataIndex: "category", render: (v) => v || "—" },
                        { title: "Email", dataIndex: "email", render: (v) => v ? <a href={`mailto:${v}`}>{v}</a> : "—" },
                        { title: "Direct #", dataIndex: "directPhone", render: (v) => v || "—" },
                        { title: "Mobile #", dataIndex: "mobilePhone", render: (v) => v || "—" },
                        { title: "HQ #", dataIndex: "hqPhone", render: (v) => v || "—" },
                        { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
                        {
                          title: "",
                          render: (_, c) => (
                            <Space>
                              <Button icon={<EditOutlined />} type="text" size="small" onClick={() => { setEditingContact(c); setContactModal(true); }} />
                              <Popconfirm title="Delete contact?" onConfirm={async () => { await crmApi.deleteContact(c.id); load(); }}>
                                <Button icon={<DeleteOutlined />} danger type="text" size="small" />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: "activity",
                label: `Activity (${retailer.activityLogs?.length ?? 0})`,
                children: (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Button icon={<PlusOutlined />} size="small" onClick={() => { setEditingActivity(null); setActivityModal(true); }}>
                        Log Activity
                      </Button>
                    </div>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={{ pageSize: 15 }}
                      dataSource={retailer.activityLogs || []}
                      columns={[
                        { title: "Date", dataIndex: "date", render: (v) => dayjs(v).format("MMM D, YYYY") },
                        { title: "Category", dataIndex: "category", render: (v) => v || "—" },
                        { title: "Rep", dataIndex: "rep", render: (v) => v || "—" },
                        { title: "Action", dataIndex: "actionTaken" },
                        { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
                        { title: "Next Step", dataIndex: "nextStep", render: (v) => v || "—" },
                        {
                          title: "Next Step Date",
                          dataIndex: "nextStepDate",
                          render: (v, row) => {
                            if (!v) return "—";
                            const overdue = !row.done && dayjs(v).isBefore(today, "day");
                            return <span style={{ color: overdue ? "#cf1322" : undefined }}>{dayjs(v).format("MMM D, YYYY")}</span>;
                          },
                        },
                        {
                          title: "Done",
                          dataIndex: "done",
                          render: (v, row) => (
                            <Checkbox
                              checked={v}
                              onChange={async (e) => {
                                await crmApi.updateActivity(row.id, { done: e.target.checked });
                                load();
                              }}
                            />
                          ),
                        },
                        {
                          title: "",
                          render: (_, a) => (
                            <Space>
                              <Button icon={<EditOutlined />} type="text" size="small" onClick={() => { setEditingActivity(a); setActivityModal(true); }} />
                              <Popconfirm title="Delete?" onConfirm={async () => { await crmApi.deleteActivity(a.id); load(); }}>
                                <Button icon={<DeleteOutlined />} danger type="text" size="small" />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: "sent",
                label: `Sent Items (${retailer.sentItems?.length ?? 0})`,
                children: (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <Button icon={<PlusOutlined />} size="small" onClick={() => { setEditingSent(null); setSentModal(true); }}>
                        Log Sent Item
                      </Button>
                    </div>
                    <Table
                      size="small"
                      rowKey="id"
                      pagination={{ pageSize: 15 }}
                      dataSource={retailer.sentItems || []}
                      columns={[
                        { title: "Date", dataIndex: "dateSent", render: (v) => dayjs(v).format("MMM D, YYYY") },
                        { title: "Category", dataIndex: "category", render: (v) => v || "—" },
                        { title: "Buyer", dataIndex: "buyerName", render: (v) => v || "—" },
                        { title: "Item", dataIndex: "itemSent" },
                        { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
                        {
                          title: "Response",
                          dataIndex: "responseReceived",
                          render: (v) => v ? (
                            <Tag color={v === "Interested" ? "green" : v === "Not Interested" ? "red" : "default"}>{v}</Tag>
                          ) : "—",
                        },
                        {
                          title: "Follow-up",
                          dataIndex: "followUpDate",
                          render: (v, row) => {
                            if (!v) return "—";
                            const overdue = !row.done && dayjs(v).isBefore(today, "day");
                            return <span style={{ color: overdue ? "#cf1322" : undefined }}>{dayjs(v).format("MMM D")}</span>;
                          },
                        },
                        {
                          title: "Done",
                          dataIndex: "done",
                          render: (v, row) => (
                            <Checkbox
                              checked={v}
                              onChange={async (e) => { await crmApi.updateSent(row.id, { done: e.target.checked }); load(); }}
                            />
                          ),
                        },
                        {
                          title: "",
                          render: (_, s) => (
                            <Space>
                              <Button icon={<EditOutlined />} type="text" size="small" onClick={() => { setEditingSent(s); setSentModal(true); }} />
                              <Popconfirm title="Delete?" onConfirm={async () => { await crmApi.deleteSent(s.id); load(); }}>
                                <Button icon={<DeleteOutlined />} danger type="text" size="small" />
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
            ]}
          />

          <ContactModal
            open={contactModal}
            onClose={() => { setContactModal(false); setEditingContact(null); }}
            onSaved={load}
            contact={editingContact}
            retailerId={Number(id)}
          />
          <ActivityModal
            open={activityModal}
            onClose={() => { setActivityModal(false); setEditingActivity(null); }}
            onSaved={load}
            log={editingActivity}
            retailerId={Number(id)}
          />
          <SentModal
            open={sentModal}
            onClose={() => { setSentModal(false); setEditingSent(null); }}
            onSaved={load}
            item={editingSent}
            retailerId={Number(id)}
          />
        </>
      )}
    </Spin>
  );
}

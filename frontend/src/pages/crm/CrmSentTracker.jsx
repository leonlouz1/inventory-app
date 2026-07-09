import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Table, Button, Tag, Spin, Alert, Typography, Space, Checkbox,
  Modal, Form, Input, DatePicker, Select, Row, Col, message, Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const ITEM_OPTIONS = ["Linesheet", "ATS", "Samples", "Follow-up", "Proposal", "Other"];
const RESPONSE_OPTIONS = ["Interested", "No response", "Not Interested", "Requested more info"];

function SentModal({ open, onClose, onSaved, item, retailers }) {
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
        await crmApi.createSent(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  }

  return (
    <Modal title={item ? "Edit Sent Item" : "Log Sent Item"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={540}>
      <Form form={form} layout="vertical">
        <Form.Item name="retailerId" label="Company" rules={[{ required: true }]}>
          <Select
            showSearch
            options={(retailers || []).map((r) => ({ value: r.id, label: r.name }))}
            filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
            placeholder="Select retailer"
          />
        </Form.Item>
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

export default function CrmSentTracker() {
  const [items, setItems] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      crmApi.listSent(showDone ? {} : { done: "false" }),
      crmApi.listRetailers(),
    ])
      .then(([s, r]) => { setItems(s); setRetailers(r); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [showDone]);

  useEffect(() => { load(); }, [load]);

  const today = dayjs();

  const columns = [
    { title: "Date Sent", dataIndex: "dateSent", render: (v) => dayjs(v).format("MMM D, YYYY"), sorter: (a, b) => a.dateSent.localeCompare(b.dateSent), defaultSortOrder: "descend" },
    {
      title: "Company",
      dataIndex: "retailerName",
      render: (name, row) => <Link to={`/crm/accounts/${row.retailerId}`}>{name}</Link>,
      sorter: (a, b) => a.retailerName.localeCompare(b.retailerName),
    },
    { title: "Category", dataIndex: "category", render: (v) => v || "—" },
    { title: "Buyer", dataIndex: "buyerName", render: (v) => v || "—" },
    { title: "Item Sent", dataIndex: "itemSent" },
    { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
    {
      title: "Response",
      dataIndex: "responseReceived",
      render: (v) => v ? (
        <Tag color={v === "Interested" ? "green" : v === "Not Interested" ? "red" : "default"}>{v}</Tag>
      ) : "—",
    },
    {
      title: "Follow-up Date",
      dataIndex: "followUpDate",
      sorter: (a, b) => (a.followUpDate || "").localeCompare(b.followUpDate || ""),
      render: (v, row) => {
        if (!v) return "—";
        const overdue = !row.done && dayjs(v).isBefore(today, "day");
        return <span style={{ color: overdue ? "#cf1322" : undefined, fontWeight: overdue ? 600 : undefined }}>{dayjs(v).format("MMM D, YYYY")}</span>;
      },
    },
    {
      title: "Done",
      dataIndex: "done",
      render: (v, row) => (
        <Checkbox checked={v} onChange={async (e) => { await crmApi.updateSent(row.id, { done: e.target.checked }); load(); }} />
      ),
    },
    {
      title: "",
      render: (_, s) => (
        <Space>
          <Button icon={<EditOutlined />} type="text" size="small" onClick={() => { setEditingItem(s); setModalOpen(true); }} />
          <Popconfirm title="Delete?" onConfirm={async () => { await crmApi.deleteSent(s.id); load(); }}>
            <Button icon={<DeleteOutlined />} danger type="text" size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Space>
          <Typography.Title level={5} style={{ margin: 0 }}>Sent Tracker</Typography.Title>
          <Checkbox checked={showDone} onChange={(e) => setShowDone(e.target.checked)}>Show completed</Checkbox>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingItem(null); setModalOpen(true); }}>
          Log Sent Item
        </Button>
      </div>
      <Table columns={columns} dataSource={items} rowKey="id" pagination={{ pageSize: 20 }} size="small" />
      <SentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingItem(null); }}
        onSaved={load}
        item={editingItem}
        retailers={retailers}
      />
    </Spin>
  );
}

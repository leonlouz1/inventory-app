import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Table, Button, Tag, Spin, Alert, Typography, Space, Select, Checkbox,
  Modal, Form, Input, DatePicker, Row, Col, message, Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const ACTION_OPTIONS = ["Called - reached", "Called - NA", "Email sent", "Meeting", "Follow-up", "Other"];

function ActivityModal({ open, onClose, onSaved, log, retailers }) {
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
        await crmApi.createActivity(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    }
  }

  return (
    <Modal title={log ? "Edit Activity" : "Log Activity"} open={open} onCancel={onClose} onOk={handleOk} destroyOnHidden width={540}>
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
            <Form.Item name="date" label="Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="category" label="Category">
              <Select options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} allowClear placeholder="All" />
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
          <Col span={12}><Form.Item name="nextStep" label="Next Step"><Input /></Form.Item></Col>
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

export default function CrmActivity() {
  const [logs, setLogs] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      crmApi.listActivity(showDone ? {} : { done: "false" }),
      crmApi.listRetailers(),
    ])
      .then(([l, r]) => { setLogs(l); setRetailers(r); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [showDone]);

  useEffect(() => { load(); }, [load]);

  const today = dayjs();

  const columns = [
    { title: "Date", dataIndex: "date", render: (v) => dayjs(v).format("MMM D, YYYY"), sorter: (a, b) => a.date.localeCompare(b.date), defaultSortOrder: "descend" },
    {
      title: "Company",
      dataIndex: "retailerName",
      render: (name, row) => <Link to={`/crm/accounts/${row.retailerId}`}>{name}</Link>,
      sorter: (a, b) => a.retailerName.localeCompare(b.retailerName),
    },
    { title: "Category", dataIndex: "category", render: (v) => v || "—" },
    { title: "Rep", dataIndex: "rep", render: (v) => v || "—" },
    { title: "Action", dataIndex: "actionTaken" },
    { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
    { title: "Next Step", dataIndex: "nextStep", render: (v) => v || "—" },
    {
      title: "Next Step Date",
      dataIndex: "nextStepDate",
      sorter: (a, b) => (a.nextStepDate || "").localeCompare(b.nextStepDate || ""),
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
        <Checkbox checked={v} onChange={async (e) => { await crmApi.updateActivity(row.id, { done: e.target.checked }); load(); }} />
      ),
    },
    {
      title: "",
      render: (_, a) => (
        <Space>
          <Button icon={<EditOutlined />} type="text" size="small" onClick={() => { setEditingLog(a); setModalOpen(true); }} />
          <Popconfirm title="Delete?" onConfirm={async () => { await crmApi.deleteActivity(a.id); load(); }}>
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
          <Typography.Title level={5} style={{ margin: 0 }}>Activity Log</Typography.Title>
          <Checkbox checked={showDone} onChange={(e) => setShowDone(e.target.checked)}>Show completed</Checkbox>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingLog(null); setModalOpen(true); }}>
          Log Activity
        </Button>
      </div>
      <Table columns={columns} dataSource={logs} rowKey="id" pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }} size="small" />
      <ActivityModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingLog(null); }}
        onSaved={load}
        log={editingLog}
        retailers={retailers}
      />
    </Spin>
  );
}

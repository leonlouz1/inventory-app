import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Button, Tag, Spin, Alert, Typography, Space, Input, Select, Modal, Form, Popconfirm, message } from "antd";
import { PlusOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { crmApi } from "../../api/inventory";
import ImportCrmSheetModal from "../../components/crm/ImportCrmSheetModal";
import ImportRetailersModal from "../../components/crm/ImportRetailersModal";
import ImportContactsModal from "../../components/crm/ImportContactsModal";
import ManageRetailerTypesModal from "../../components/crm/ManageRetailerTypesModal";

const STATUSES = [
  "Active", "Order Placed", "Warm", "Not Contacted",
  "No Response", "Not Interested", "No Contact Found",
];
const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s, i]));
const STATUS_COLORS = {
  "Active": "green", "Order Placed": "blue", "Warm": "orange",
  "Not Contacted": "default", "No Response": "purple",
  "Not Interested": "red", "No Contact Found": "default",
};
const PRIORITIES = ["3 - High", "2 - Medium", "1 - Low"];

// Best status across all categories (lowest index = most advanced)
function bestStatus(retailer) {
  let best = null;
  let bestOrder = 999;
  for (const c of retailer.categories || []) {
    const o = STATUS_ORDER[c.status] ?? 999;
    if (o < bestOrder) { bestOrder = o; best = c.status; }
  }
  return best;
}

function primaryContact(retailer) {
  return retailer.contacts?.[0] || null;
}

function NewRetailerModal({ open, onClose, onCreated, retailerTypes }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) form.resetFields(); }, [open, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await crmApi.createRetailer(values);
      message.success(`${values.name} added`);
      onCreated();
      onClose();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Account" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Company Name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="type" label="Type">
          <Select options={(retailerTypes || []).map((t) => ({ value: t, label: t }))} allowClear placeholder="Select type" />
        </Form.Item>
        <Form.Item name="priority" label="Priority" initialValue="1 - Low">
          <Select options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
        </Form.Item>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

export default function CrmAccounts() {
  const navigate = useNavigate();
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retailerTypes, setRetailerTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState([]);
  const [typeFilter, setTypeFilter] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [importRetailersOpen, setImportRetailersOpen] = useState(false);
  const [importContactsOpen, setImportContactsOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([crmApi.listRetailers(), crmApi.listRetailerTypes()])
      .then(([r, t]) => { setRetailers(r); setRetailerTypes(t.map((x) => x.name)); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return retailers.filter((r) => {
      if (term && !r.name.toLowerCase().includes(term) &&
        !(primaryContact(r)?.name || "").toLowerCase().includes(term)) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (statusFilter.length) {
        const best = bestStatus(r);
        if (!best || !statusFilter.includes(best)) return false;
      }
      return true;
    });
  }, [retailers, search, statusFilter, typeFilter]);

  async function handleDelete(id, name) {
    try {
      await crmApi.deleteRetailer(id);
      message.success(`${name} deleted`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  const columns = [
    {
      title: "Company",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, r) => (
        <a onClick={() => navigate(`/crm/accounts/${r.id}`)} style={{ fontWeight: 500 }}>{name}</a>
      ),
      width: 200,
    },
    {
      title: "Buyer",
      key: "buyer",
      width: 160,
      render: (_, r) => primaryContact(r)?.name || <span style={{ color: "#bbb" }}>—</span>,
      sorter: (a, b) => (primaryContact(a)?.name || "").localeCompare(primaryContact(b)?.name || ""),
    },
    {
      title: "Status",
      key: "status",
      width: 140,
      render: (_, r) => {
        const s = bestStatus(r);
        return s ? <Tag color={STATUS_COLORS[s]}>{s}</Tag> : <Tag>—</Tag>;
      },
      sorter: (a, b) => (STATUS_ORDER[bestStatus(a)] ?? 999) - (STATUS_ORDER[bestStatus(b)] ?? 999),
    },
    {
      title: "Last Contact",
      key: "lastContact",
      width: 130,
      render: (_, r) => r.lastContactDate || <span style={{ color: "#bbb" }}>Never</span>,
      sorter: (a, b) => (a.lastContactDate || "").localeCompare(b.lastContactDate || ""),
    },
    {
      title: "Phone",
      key: "phone",
      width: 140,
      render: (_, r) => {
        const c = primaryContact(r);
        const phone = c?.directPhone || c?.mobilePhone || c?.hqPhone;
        return phone || <span style={{ color: "#bbb" }}>—</span>;
      },
    },
    {
      title: "Email",
      key: "email",
      width: 200,
      render: (_, r) => {
        const email = primaryContact(r)?.email;
        return email
          ? <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>{email}</a>
          : <span style={{ color: "#bbb" }}>—</span>;
      },
    },
    {
      title: "Categories",
      key: "categories",
      render: (_, r) => (
        <Space size={3} wrap>
          {r.categories.map((c) => (
            <Tag key={c.category} color={STATUS_COLORS[c.status] || "default"} style={{ fontSize: 11, margin: 0 }}>
              {c.category}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 120,
      render: (v) => v || <span style={{ color: "#bbb" }}>—</span>,
      sorter: (a, b) => (a.type || "").localeCompare(b.type || ""),
    },
    {
      title: "",
      key: "actions",
      width: 48,
      render: (_, r) => (
        <Popconfirm title={`Delete ${r.name}?`} onConfirm={() => handleDelete(r.id, r.name)}>
          <Button icon={<DeleteOutlined />} danger type="text" size="small" />
        </Popconfirm>
      ),
    },
  ];

  const pipelineCounts = useMemo(() => {
    const counts = {};
    retailers.forEach((r) => {
      const s = bestStatus(r) || "Not Contacted";
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [retailers]);

  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <Spin spinning={loading}>
      {/* Pipeline bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUSES.map((s) => {
          const active = statusFilter.includes(s);
          return (
            <div
              key={s}
              onClick={() => setStatusFilter(active ? statusFilter.filter((x) => x !== s) : [...statusFilter, s])}
              style={{
                cursor: "pointer", padding: "5px 14px", borderRadius: 6, fontSize: 13,
                background: active ? "#1677ff" : "#f5f5f5",
                color: active ? "#fff" : "#333",
                fontWeight: active ? 600 : 400,
                border: `1px solid ${active ? "#1677ff" : "#e8e8e8"}`,
              }}
            >
              {s} <strong>{pipelineCounts[s] || 0}</strong>
            </div>
          );
        })}
        {statusFilter.length > 0 && (
          <div
            onClick={() => setStatusFilter([])}
            style={{ cursor: "pointer", padding: "5px 12px", borderRadius: 6, fontSize: 12, color: "#888", background: "#fff", border: "1px solid #e8e8e8" }}
          >
            Clear
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Accounts <span style={{ color: "#aaa", fontWeight: 400, fontSize: 14 }}>({filtered.length})</span>
        </Typography.Title>
        <Space wrap>
          <Input.Search
            placeholder="Search company or buyer"
            allowClear
            style={{ width: 220 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            mode="multiple"
            placeholder="Filter by status"
            allowClear
            style={{ minWidth: 180 }}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            value={statusFilter}
            onChange={setStatusFilter}
            maxTagCount="responsive"
          />
          <Select
            placeholder="Type"
            allowClear
            style={{ minWidth: 130 }}
            options={retailerTypes.map((t) => ({ value: t, label: t }))}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v ?? null)}
          />
          <Button onClick={() => setManageTypesOpen(true)}>Manage Types</Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportSheetOpen(true)}>Import Sheet</Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportRetailersOpen(true)}>Import</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Add Account</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="small"
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ["20", "50", "100"] }}
        onRow={(r) => ({ onClick: () => navigate(`/crm/accounts/${r.id}`), style: { cursor: "pointer" } })}
      />

      <NewRetailerModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} retailerTypes={retailerTypes} />
      <ManageRetailerTypesModal open={manageTypesOpen} onClose={() => setManageTypesOpen(false)} onChanged={() => load()} />
      <ImportRetailersModal open={importRetailersOpen} onClose={() => setImportRetailersOpen(false)} onImported={load} />
      <ImportContactsModal open={importContactsOpen} onClose={() => setImportContactsOpen(false)} onImported={load} retailers={retailers} />
      <ImportCrmSheetModal open={importSheetOpen} onClose={() => setImportSheetOpen(false)} onImported={load} />
    </Spin>
  );
}

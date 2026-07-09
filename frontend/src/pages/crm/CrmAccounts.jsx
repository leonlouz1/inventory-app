import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Table, Button, Tag, Spin, Alert, Typography, Space, Input, Select,
  Modal, Form, Popconfirm, message,
} from "antd";
import { PlusOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { crmApi } from "../../api/inventory";
import ImportRetailersModal from "../../components/crm/ImportRetailersModal";
import ImportContactsModal from "../../components/crm/ImportContactsModal";
import ManageRetailerTypesModal from "../../components/crm/ManageRetailerTypesModal";
import ImportCrmSheetModal from "../../components/crm/ImportCrmSheetModal";

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const PRIORITIES = ["3 - High", "2 - Medium", "1 - Low"];
const STATUSES = [
  "Active", "Order Placed", "Warm", "Not Contacted",
  "No Response", "Not Interested", "No Contact Found", "N/A",
];

const STATUS_COLORS = {
  "Active": "green", "Order Placed": "blue", "Warm": "orange",
  "Not Contacted": "default", "No Response": "purple",
  "Not Interested": "red", "No Contact Found": "default", "N/A": "default",
};

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
    <Modal title="New Retailer" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="type" label="Type">
          <Select options={(retailerTypes || []).map((t) => ({ value: t, label: t }))} allowClear placeholder="Select type" />
        </Form.Item>
        <Form.Item name="priority" label="Priority" initialValue="1 - Low">
          <Select options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function CrmAccounts() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retailerTypes, setRetailerTypes] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [importRetailersOpen, setImportRetailersOpen] = useState(false);
  const [importContactsOpen, setImportContactsOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("name") || "");
  const [typeFilter, setTypeFilter] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);

  const loadTypes = useCallback(() =>
    crmApi.listRetailerTypes().then((t) => setRetailerTypes(t.map((x) => x.name))), []);

  const load = useCallback(() => {
    setLoading(true);
    return crmApi.listRetailers()
      .then(setRetailers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); loadTypes(); }, [load, loadTypes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return retailers.filter((r) => {
      if (term && !r.name.toLowerCase().includes(term)) return false;
      if (typeFilter.length && !typeFilter.includes(r.type)) return false;
      if (priorityFilter.length && !priorityFilter.includes(r.priority)) return false;
      if (statusFilter.length) {
        const hasStatus = r.categories.some((c) => statusFilter.includes(c.status));
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [retailers, search, typeFilter, priorityFilter, statusFilter]);

  async function handleDelete(id, name) {
    try {
      await crmApi.deleteRetailer(id);
      message.success(`${name} deleted`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  // Inline status/buyer update
  async function handleCategoryUpdate(retailerId, category, field, value) {
    try {
      await crmApi.updateCategory(retailerId, { category, [field]: value });
      setRetailers((prev) =>
        prev.map((r) => {
          if (r.id !== retailerId) return r;
          return {
            ...r,
            categories: r.categories.map((c) =>
              c.category === category ? { ...c, [field]: value } : c
            ),
          };
        })
      );
    } catch (err) {
      message.error(err.message);
    }
  }

  const categoryColumns = CRM_CATEGORIES.map((cat) => ({
    title: cat,
    key: cat,
    width: 160,
    render: (_, retailer) => {
      const c = retailer.categories.find((x) => x.category === cat);
      if (!c) return <Tag color="default">N/A</Tag>;
      return (
        <div style={{ fontSize: 12 }}>
          <Select
            size="small"
            value={c.status}
            style={{ width: "100%", marginBottom: 2 }}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            onChange={(val) => handleCategoryUpdate(retailer.id, cat, "status", val)}
            variant="borderless"
            popupMatchSelectWidth={false}
            labelRender={() => <Tag color={STATUS_COLORS[c.status]} style={{ margin: 0 }}>{c.status}</Tag>}
          />
          <div style={{ color: "#888", paddingLeft: 4 }}>{c.buyerName || "—"}</div>
        </div>
      );
    },
  }));

  const columns = [
    {
      title: "Company",
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, r) => (
        <a onClick={() => navigate(`/crm/accounts/${r.id}`)} style={{ cursor: "pointer" }}>{name}</a>
      ),
      fixed: "left",
      width: 180,
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 130,
      render: (v) => v || "—",
      sorter: (a, b) => (a.type || "").localeCompare(b.type || ""),
    },
    {
      title: "Priority",
      dataIndex: "priority",
      width: 110,
      sorter: (a, b) => b.priority.localeCompare(a.priority),
      render: (v) => {
        const color = v === "3 - High" ? "red" : v === "2 - Medium" ? "orange" : "default";
        return <Tag color={color}>{v}</Tag>;
      },
    },
    ...categoryColumns,
    {
      title: "",
      key: "actions",
      fixed: "right",
      width: 60,
      render: (_, r) => (
        <Popconfirm title={`Delete ${r.name}?`} onConfirm={() => handleDelete(r.id, r.name)}>
          <Button icon={<DeleteOutlined />} danger type="text" size="small" />
        </Popconfirm>
      ),
    },
  ];

  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Accounts</Typography.Title>
        <Space wrap>
          <Input.Search
            placeholder="Search company"
            allowClear
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            mode="multiple" placeholder="Type" allowClear style={{ minWidth: 140 }}
            options={retailerTypes.map((t) => ({ value: t, label: t }))}
            value={typeFilter} onChange={setTypeFilter} maxTagCount="responsive"
          />
          <Select
            mode="multiple" placeholder="Priority" allowClear style={{ minWidth: 130 }}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
            value={priorityFilter} onChange={setPriorityFilter} maxTagCount="responsive"
          />
          <Select
            mode="multiple" placeholder="Status (any cat)" allowClear style={{ minWidth: 160 }}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            value={statusFilter} onChange={setStatusFilter} maxTagCount="responsive"
          />
          <Button onClick={() => setManageTypesOpen(true)}>
            Manage Types
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportSheetOpen(true)}>
            Import from Google Sheets
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportRetailersOpen(true)}>
            Import Retailers
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setImportContactsOpen(true)}>
            Import Contacts
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Add Retailer
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        scroll={{ x: "max-content" }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
        size="small"
      />

      <NewRetailerModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={load} retailerTypes={retailerTypes} />
      <ManageRetailerTypesModal
        open={manageTypesOpen}
        onClose={() => setManageTypesOpen(false)}
        onChanged={loadTypes}
      />
      <ImportRetailersModal
        open={importRetailersOpen}
        onClose={() => setImportRetailersOpen(false)}
        onImported={load}
      />
      <ImportContactsModal
        open={importContactsOpen}
        onClose={() => setImportContactsOpen(false)}
        onImported={load}
        retailers={retailers}
      />
      <ImportCrmSheetModal
        open={importSheetOpen}
        onClose={() => setImportSheetOpen(false)}
        onImported={load}
      />
    </Spin>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { DeleteOutlined, InboxOutlined, PlusOutlined, RollbackOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { CRM_CATEGORIES, STATUSES, STATUS_COLORS } from "../../constants/crm";
import ContactDrawer from "../../components/crm/ContactDrawer";
import ManageRetailerTypesModal from "../../components/crm/ManageRetailerTypesModal";

const PRIORITIES = ["3 - High", "2 - Medium", "1 - Low"];
const PRIORITY_COLORS = { "3 - High": "red", "2 - Medium": "orange", "1 - Low": "default" };
const LINE = { height: 26, display: "flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" };
const DIVIDER = { borderLeft: "2px solid #1677ff" };

function NewRetailerModal({ open, onClose, onCreated, retailerTypes }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  async function handleOk() {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await crmApi.createRetailer(values);
      message.success(`${values.name} added`);
      onCreated();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New retailer" open={open} onCancel={onClose} onOk={handleOk} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" preserve={false} initialValues={{ priority: "1 - Low" }}>
        <Form.Item name="name" label="Company name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="type" label="Type">
          <Select options={retailerTypes.map((t) => ({ value: t, label: t }))} allowClear placeholder="Select type" />
        </Form.Item>
        <Form.Item name="priority" label="Priority">
          <Select options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Every retailer in one grid, with a Buyer / Status / Notes column group per
// category — like the ACCOUNTS tab. It fills itself from each buyer's status
// and latest logged entry, so whatever is logged elsewhere shows up here.
export default function CrmAccounts() {
  const [retailers, setRetailers] = useState(null);
  const [error, setError] = useState(null);
  const [retailerTypes, setRetailerTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [openId, setOpenId] = useState(null);

  // Active and archived come back together: archived ones stay out of the
  // main list but still turn up when searched for
  const load = useCallback(() => crmApi.listRetailers("all")
    .then((r) => { setRetailers(r); setError(null); })
    .catch((err) => setError(err.message)), []);

  const loadTypes = useCallback(() => crmApi.listRetailerTypes()
    .then((t) => setRetailerTypes(t.map((x) => x.name)))
    .catch(() => {}), []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTypes(); }, [loadTypes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (retailers || []).filter((r) => {
      if (showArchived ? !r.archived : r.archived && !term) return false;
      if (term && !r.name.toLowerCase().includes(term) && !r.categories.some((c) => c.buyerName.toLowerCase().includes(term))) return false;
      if (typeFilter && r.type !== typeFilter) return false;
      if (priorityFilter && r.priority !== priorityFilter) return false;
      if (categoryFilter && !r.categories.some((c) => c.category === categoryFilter)) return false;
      return true;
    });
  }, [retailers, search, typeFilter, priorityFilter, categoryFilter, showArchived]);

  // Archived retailers that have people on them — likely archived by mistake
  const archivedWithPeople = (retailers || []).filter((r) => r.archived && r.contacts.length);

  async function restore(ids) {
    try {
      const { restored } = await crmApi.unarchiveRetailers(ids);
      message.success(`Restored ${restored} retailer${restored === 1 ? "" : "s"}`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function updateRetailer(r, fields) {
    try {
      await crmApi.updateRetailer(r.id, fields);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function setBuyerStatus(buyerId, status) {
    try {
      await crmApi.updateContact(buyerId, { status });
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (error) return <Alert type="error" message={error} showIcon />;

  const buyersIn = (r, cat) => r.categories.find((c) => c.category === cat)?.buyers || [];
  const shownCategories = categoryFilter ? [categoryFilter] : CRM_CATEGORIES;

  const columns = [
    {
      title: "Retailer",
      dataIndex: "name",
      fixed: "left",
      width: 170,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, r) => (
        <Space size={4} wrap>
          <Link to={`/crm/accounts/${r.id}`} style={{ fontWeight: 600 }}>{name}</Link>
          {r.archived && <Tag style={{ margin: 0, fontSize: 11 }}>Archived</Tag>}
        </Space>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      width: 150,
      sorter: (a, b) => (a.type || "").localeCompare(b.type || ""),
      render: (type, r) => (
        <Select size="small" variant="borderless" value={type || undefined} placeholder="—" style={{ width: "100%" }} allowClear
          options={retailerTypes.map((t) => ({ value: t, label: t }))} onChange={(v) => updateRetailer(r, { type: v || null })} />
      ),
    },
    {
      title: "Priority",
      dataIndex: "priority",
      width: 120,
      sorter: (a, b) => a.priority.localeCompare(b.priority),
      render: (p, r) => (
        <Select size="small" variant="borderless" value={p} style={{ width: "100%" }}
          labelRender={() => <Tag color={PRIORITY_COLORS[p]} style={{ margin: 0 }}>{p}</Tag>}
          options={PRIORITIES.map((x) => ({ value: x, label: x }))} onChange={(v) => updateRetailer(r, { priority: v })} />
      ),
    },
    ...shownCategories.map((cat) => ({
      title: cat,
      key: cat,
      align: "center",
      onHeaderCell: () => ({ style: DIVIDER }),
      children: [
        {
          title: "Buyer",
          key: `${cat}-buyer`,
          width: 150,
          onHeaderCell: () => ({ style: DIVIDER }),
          onCell: () => ({ style: DIVIDER }),
          render: (_, r) => buyersIn(r, cat).map((b) => (
            <div key={b.id} style={LINE}><a onClick={() => setOpenId(b.id)} style={{ fontWeight: 500 }}>{b.name}</a></div>
          )),
        },
        {
          title: "Status",
          key: `${cat}-status`,
          width: 145,
          render: (_, r) => buyersIn(r, cat).map((b) => (
            <div key={b.id} style={LINE}>
              <Select size="small" variant="borderless" value={b.status} style={{ width: "100%" }} popupMatchSelectWidth={false}
                labelRender={() => <Tag color={STATUS_COLORS[b.status]} style={{ margin: 0 }}>{b.status}</Tag>}
                options={STATUSES.map((s) => ({ value: s, label: s }))} onChange={(v) => setBuyerStatus(b.id, v)} />
            </div>
          )),
        },
        {
          title: "Notes",
          key: `${cat}-notes`,
          width: 190,
          render: (_, r) => buyersIn(r, cat).map((b) => {
            const a = b.lastActivity;
            return (
              <div key={b.id} style={LINE}>
                {a && (
                  <Tooltip title={`${dayjs(a.date).format("MMM D")} · ${a.actionTaken}${a.notes ? ` — ${a.notes}` : ""}`}>
                    <Typography.Text style={{ fontSize: 12 }} ellipsis>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{dayjs(a.date).format("M/D")} </Typography.Text>
                      {a.notes || a.actionTaken}
                    </Typography.Text>
                  </Tooltip>
                )}
              </div>
            );
          }),
        },
      ],
    })),
    {
      title: "",
      key: "actions",
      width: 70,
      render: (_, r) => (
        <Space size={0}>
          <Popconfirm
            title={r.archived ? `Restore ${r.name}?` : `Archive ${r.name}?`}
            description={r.archived ? "Moves them back to the main list." : "Hides them from the main lists. They still turn up in searches."}
            onConfirm={async () => { await crmApi.archiveRetailer(r.id, !r.archived); load(); }}
          >
            <Button icon={r.archived ? <RollbackOutlined /> : <InboxOutlined />} type="text" size="small" title={r.archived ? "Restore" : "Archive"} />
          </Popconfirm>
          <Popconfirm title={`Delete ${r.name}?`} description="Deletes their contacts and history too."
            okButtonProps={{ danger: true }} onConfirm={async () => { await crmApi.deleteRetailer(r.id); load(); }}>
            <Button icon={<DeleteOutlined />} danger type="text" size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {showArchived ? "Archived retailers" : "Retailers"} {retailers && <span style={{ color: "#aaa", fontWeight: 400, fontSize: 15 }}>({filtered.length})</span>}
        </Typography.Title>
        <Space wrap>
          <Input.Search placeholder="Search retailer or buyer" allowClear style={{ width: 210 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select placeholder="Category" allowClear style={{ width: 120 }} value={categoryFilter} onChange={(v) => setCategoryFilter(v ?? null)}
            options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Select placeholder="Type" allowClear style={{ width: 140 }} value={typeFilter} onChange={(v) => setTypeFilter(v ?? null)}
            options={retailerTypes.map((t) => ({ value: t, label: t }))} />
          <Select placeholder="Priority" allowClear style={{ width: 120 }} value={priorityFilter} onChange={(v) => setPriorityFilter(v ?? null)}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
          <Button icon={<InboxOutlined />} type={showArchived ? "primary" : "default"} onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Back to active" : "Archived"}
          </Button>
          {showArchived && archivedWithPeople.length > 0 && (
            <Popconfirm
              title={`Restore ${archivedWithPeople.length} archived retailers that have contacts?`}
              onConfirm={() => restore(archivedWithPeople.map((r) => r.id))}
            >
              <Button icon={<RollbackOutlined />}>Restore {archivedWithPeople.length} with contacts</Button>
            </Popconfirm>
          )}
          <Button icon={<SettingOutlined />} onClick={() => setManageTypesOpen(true)}>Types</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add retailer</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        size="small"
        bordered
        loading={retailers === null}
        columns={columns}
        dataSource={filtered}
        rowClassName={(r) => (r.archived && !showArchived ? "crm-archived-row" : "")}
        scroll={{ x: "max-content", y: "calc(100vh - 280px)" }}
        pagination={{ defaultPageSize: 100, showSizeChanger: true, pageSizeOptions: ["50", "100", "200", "500"] }}
      />

      {openId && <ContactDrawer key={openId} contactId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      <NewRetailerModal open={adding} onClose={() => setAdding(false)} onCreated={load} retailerTypes={retailerTypes} />
      <ManageRetailerTypesModal open={manageTypesOpen} onClose={() => setManageTypesOpen(false)} onChanged={loadTypes} />
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Button, Input, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { ACTION_COLORS, ACTION_LABELS, CRM_CATEGORIES, STATUSES, STATUS_COLORS } from "../../constants/crm";
import ContactDrawer, { PhoneLinks } from "../../components/crm/ContactDrawer";
import ContactFormModal from "../../components/crm/ContactFormModal";
import ImportCrmTabModal from "../../components/crm/ImportCrmTabModal";

const today = () => dayjs().format("YYYY-MM-DD");

function FollowUp({ date, status }) {
  if (!date) return <Typography.Text type="secondary">—</Typography.Text>;
  const closed = ["Not Interested", "N/A"].includes(status);
  const color = closed ? undefined : date < today() ? "#cf1322" : date === today() ? "#d46b08" : undefined;
  return <span style={{ color, fontWeight: color ? 600 : 400 }}>{dayjs(date).format("MMM D")}</span>;
}

// Fresh state per category when switching between them in the menu
export default function CrmCategoryRoute() {
  const { category } = useParams();
  return <CrmCategory key={category} category={category} />;
}

// One category's work list — the replacement for the "<CATEGORY> NOTES" tabs
function CrmCategory({ category }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState([]);
  const [view, setView] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => crmApi.categoryList(category)
    .then((r) => { setRows(r); setError(null); })
    .catch((err) => setError(err.message)), [category]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((r) => {
      // Buyers at archived retailers only show up when searched for
      if (r.retailerArchived && !term) return false;
      if (term && !`${r.retailerName} ${r.name} ${r.email || ""} ${r.lastActivity?.notes || ""}`.toLowerCase().includes(term)) return false;
      if (statuses.length && !statuses.includes(r.status)) return false;
      if (view === "due" && !(r.nextFollowUp && r.nextFollowUp <= today() && !["Not Interested", "N/A"].includes(r.status))) return false;
      return true;
    });
  }, [rows, search, statuses, view]);

  const dueCount = (rows || []).filter((r) => !r.retailerArchived && r.nextFollowUp && r.nextFollowUp <= today() && !["Not Interested", "N/A"].includes(r.status)).length;

  if (!CRM_CATEGORIES.includes(category)) return <Alert type="error" message={`Unknown category "${category}"`} />;
  if (error) return <Alert type="error" message={error} showIcon />;

  const columns = [
    {
      title: "Company",
      dataIndex: "retailerName",
      width: 150,
      sorter: (a, b) => a.retailerName.localeCompare(b.retailerName),
      render: (v, r) => (
        <Space size={4} wrap>
          <Link to={`/crm/accounts/${r.retailerId}`} onClick={(e) => e.stopPropagation()}>{v}</Link>
          {r.retailerArchived && <Tag style={{ margin: 0, fontSize: 11 }}>Archived</Tag>}
        </Space>
      ),
    },
    {
      title: "Buyer",
      dataIndex: "name",
      width: 160,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v) => <a style={{ fontWeight: 500 }}>{v}</a>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 130,
      sorter: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
      render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: "Last update",
      key: "last",
      width: 120,
      sorter: (a, b) => (a.lastActivity?.date || "").localeCompare(b.lastActivity?.date || ""),
      render: (_, r) => r.lastActivity ? (
        <Space direction="vertical" size={0}>
          <span>{dayjs(r.lastActivity.date).format("MMM D")}</span>
          <Tag color={ACTION_COLORS[r.lastActivity.actionTaken]} style={{ margin: 0, fontSize: 11 }}>
            {ACTION_LABELS[r.lastActivity.actionTaken] || r.lastActivity.actionTaken}
          </Tag>
        </Space>
      ) : <Typography.Text type="secondary">Never</Typography.Text>,
    },
    {
      title: "Notes",
      key: "notes",
      width: 280,
      render: (_, r) => (
        <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          {r.lastActivity?.notes || ""}
        </Typography.Paragraph>
      ),
    },
    {
      title: "Next follow-up",
      dataIndex: "nextFollowUp",
      width: 110,
      defaultSortOrder: "ascend",
      sorter: (a, b) => (a.nextFollowUp || "9999").localeCompare(b.nextFollowUp || "9999"),
      render: (d, r) => <FollowUp date={d} status={r.status} />,
    },
    {
      title: "Contact",
      key: "contact",
      width: 230,
      render: (_, r) => (
        <div style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
          {r.email && <div><a href={`mailto:${r.email}`}>{r.email}</a></div>}
          <PhoneLinks contact={r} size={12} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {category} {rows && <span style={{ color: "#aaa", fontWeight: 400, fontSize: 15 }}>({filtered.length} buyers)</span>}
        </Typography.Title>
        <Space wrap>
          <Segmented value={view} onChange={setView} options={[{ value: "all", label: "All" }, { value: "due", label: `Follow-ups due (${dueCount})` }]} />
          <Input.Search placeholder="Search company, buyer, notes" allowClear style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select mode="multiple" placeholder="Status" allowClear style={{ minWidth: 160 }} maxTagCount="responsive"
            options={STATUSES.map((s) => ({ value: s, label: s }))} value={statuses} onChange={setStatuses} />
          <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>Import tab</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add buyer</Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={rows === null}
        columns={columns}
        dataSource={filtered}
        rowClassName={(r) => (r.retailerArchived ? "crm-archived-row" : "")}
        scroll={{ x: 1200 }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["25", "50", "100", "200"] }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: "pointer" } })}
      />

      {openId && <ContactDrawer key={openId} contactId={openId} category={category} onClose={() => setOpenId(null)} onChanged={load} />}
      <ContactFormModal
        open={adding}
        defaults={{ categories: [category], role: "Buyer" }}
        onClose={() => setAdding(false)}
        onSaved={(c) => { load(); setOpenId(c.id); }}
      />
      <ImportCrmTabModal open={importing} category={category} onClose={() => setImporting(false)} onImported={load} />
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Button, Collapse, Input, Segmented, Select, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import {
  CheckCircleOutlined, EyeInvisibleOutlined, EyeOutlined, PlusOutlined, UploadOutlined, VerticalAlignBottomOutlined, VerticalAlignTopOutlined,
} from "@ant-design/icons";
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

const isDue = (b) => b.nextFollowUp && b.nextFollowUp <= today() && !["Not Interested", "N/A"].includes(b.status);

// One row per retailer. The main buyer is whoever was worked with most
// recently (then the most advanced status); the rest fold under the row.
function groupByRetailer(buyers) {
  const byRetailer = new Map();
  for (const b of buyers) {
    if (!byRetailer.has(b.retailerId)) byRetailer.set(b.retailerId, []);
    byRetailer.get(b.retailerId).push(b);
  }
  return [...byRetailer.values()].map((group) => {
    const [main, ...others] = [...group].sort((a, b) =>
      (b.lastActivity?.date || "").localeCompare(a.lastActivity?.date || "")
      || STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
      || a.name.localeCompare(b.name));
    return { ...main, key: `r${main.retailerId}`, others, buyerIds: group.map((b) => b.id) };
  });
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
  const [selected, setSelected] = useState([]);
  const [selectedActive, setSelectedActive] = useState([]);
  const [selectedHidden, setSelectedHidden] = useState([]);

  const load = useCallback(() => crmApi.categoryList(category)
    .then((r) => { setRows(r); setError(null); })
    .catch((err) => setError(err.message)), [category]);

  useEffect(() => { load(); }, [load]);

  const isHidden = useCallback((r) => r.hiddenCategories.includes(category), [category]);
  const isActive = useCallback((r) => !r.hiddenCategories.includes(category) && r.activeCategories.includes(category), [category]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((r) => {
      // Buyers at archived retailers only show up when searched for
      if (r.retailerArchived && !term) return false;
      if (term && !`${r.retailerName} ${r.name} ${r.email || ""} ${r.lastActivity?.notes || ""}`.toLowerCase().includes(term)) return false;
      if (statuses.length && !statuses.includes(r.status)) return false;
      return true;
    });
  }, [rows, search, statuses]);

  // Retailers you're chasing up top; accounts already ordering sit in Active
  // accounts below, and the ones you're not chasing are parked in Hidden
  const dueOnly = (groups) => groups.filter((g) => view !== "due" || [g, ...g.others].some(isDue));
  const filtered = dueOnly(groupByRetailer(matches.filter((r) => !isHidden(r) && !isActive(r))));
  const activeRows = dueOnly(groupByRetailer(matches.filter(isActive)));
  const hiddenRows = groupByRetailer(matches.filter(isHidden));
  const idsFor = (keys, groups) => groups.filter((g) => keys.includes(g.key)).flatMap((g) => g.buyerIds);

  async function moveTo(ids, to) {
    try {
      await crmApi.moveInCategory(category, ids, to);
      message.success({ hidden: "Moved to Hidden", active: "Moved to Active accounts", list: "Moved back to the list" }[to]);
      setSelected([]);
      setSelectedActive([]);
      setSelectedHidden([]);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  const dueIn = (inSection) => new Set((rows || []).filter((r) => !r.retailerArchived && inSection(r) && isDue(r)).map((r) => r.retailerId)).size;
  const dueCount = dueIn((r) => !isHidden(r) && !isActive(r));
  const activeDueCount = dueIn(isActive);

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
      render: (v, r) => (
        <Space size={4}>
          <a style={{ fontWeight: 500 }}>{v}</a>
          {r.others?.length > 0 && (
            <Tooltip title={r.others.map((o) => o.name).join(", ")}>
              <Tag style={{ margin: 0, fontSize: 11 }}>+{r.others.length}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
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
    {
      title: "",
      key: "move",
      width: 72,
      render: (_, r) => {
        const ids = r.buyerIds || [r.id];
        return (
          <span onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
            {isHidden(r) ? (
              <Tooltip title={`Bring back to ${category}`}>
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => moveTo(ids, "list")} />
              </Tooltip>
            ) : (
              <>
                {isActive(r) ? (
                  <Tooltip title="Back up to the main list">
                    <Button type="text" size="small" icon={<VerticalAlignTopOutlined />} onClick={() => moveTo(ids, "list")} />
                  </Tooltip>
                ) : (
                  <Tooltip title="Move down to Active accounts">
                    <Button type="text" size="small" icon={<VerticalAlignBottomOutlined />} onClick={() => moveTo(ids, "active")} />
                  </Tooltip>
                )}
                <Tooltip title={`Hide from ${category} for now`}>
                  <Button type="text" size="small" icon={<EyeInvisibleOutlined />} onClick={() => moveTo(ids, "hidden")} />
                </Tooltip>
              </>
            )}
          </span>
        );
      },
    },
  ];

  // The other buyers at a retailer, under its row
  const expandable = {
    rowExpandable: (r) => r.others.length > 0,
    expandedRowRender: (r) => (
      <Space direction="vertical" size={6} style={{ width: "100%", paddingLeft: 8 }}>
        {r.others.map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <a onClick={() => setOpenId(o.id)} style={{ fontWeight: 500, minWidth: 150 }}>{o.name}</a>
            <Tag color={STATUS_COLORS[o.status]} style={{ margin: 0 }}>{o.status}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 12, flex: 1, minWidth: 200 }} ellipsis>
              {o.lastActivity ? `${dayjs(o.lastActivity.date).format("MMM D")} · ${o.lastActivity.notes || o.lastActivity.actionTaken}` : "Nothing logged"}
            </Typography.Text>
            {o.nextFollowUp && <span style={{ fontSize: 12 }}>Follow up <FollowUp date={o.nextFollowUp} status={o.status} /></span>}
            {o.email && <a href={`mailto:${o.email}`} style={{ fontSize: 12 }}>{o.email}</a>}
          </div>
        ))}
      </Space>
    ),
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {category} {rows && (
            <span style={{ color: "#aaa", fontWeight: 400, fontSize: 15 }}>
              ({filtered.length} retailers{activeRows.length ? `, ${activeRows.length} active` : ""}{hiddenRows.length ? `, ${hiddenRows.length} hidden` : ""})
            </span>
          )}
        </Typography.Title>
        <Space wrap>
          {selected.length > 0 && (
            <>
              <Button icon={<VerticalAlignBottomOutlined />} onClick={() => moveTo(idsFor(selected, filtered), "active")}>Move {selected.length} to Active</Button>
              <Button icon={<EyeInvisibleOutlined />} onClick={() => moveTo(idsFor(selected, filtered), "hidden")}>Hide {selected.length}</Button>
            </>
          )}
          <Segmented value={view} onChange={setView} options={[{ value: "all", label: "All" }, { value: "due", label: `Follow-ups due (${dueCount})` }]} />
          <Input.Search placeholder="Search company, buyer, notes" allowClear style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select mode="multiple" placeholder="Status" allowClear style={{ minWidth: 160 }} maxTagCount="responsive"
            options={STATUSES.map((s) => ({ value: s, label: s }))} value={statuses} onChange={setStatuses} />
          <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>Import tab</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add buyer</Button>
        </Space>
      </div>

      <Table
        rowKey="key"
        size="small"
        loading={rows === null}
        expandable={expandable}
        columns={columns}
        dataSource={filtered}
        rowClassName={(r) => (r.retailerArchived ? "crm-archived-row" : "")}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: 36 }}
        scroll={{ x: 1280 }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["25", "50", "100", "200"] }}
        onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: "pointer" } })}
      />

      {rows && (
        <Collapse
          style={{ marginTop: 16 }}
          defaultActiveKey={["active"]}
          items={[{
            key: "active",
            label: (
              <span>
                <CheckCircleOutlined style={{ color: "#52c41a" }} /> Active accounts ({activeRows.length})
                {activeDueCount > 0 && <Tag color="orange" style={{ marginLeft: 8 }}>{activeDueCount} follow-up{activeDueCount === 1 ? "" : "s"} due</Tag>}
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  Accounts you've moved down so they stay out of the way of the list above.
                </Typography.Text>
              </span>
            ),
            extra: selectedActive.length > 0 && (
              <Space size={6} onClick={(e) => e.stopPropagation()}>
                <Button size="small" icon={<VerticalAlignTopOutlined />} onClick={() => moveTo(idsFor(selectedActive, activeRows), "list")}>
                  Move {selectedActive.length} up
                </Button>
                <Button size="small" icon={<EyeInvisibleOutlined />} onClick={() => moveTo(idsFor(selectedActive, activeRows), "hidden")}>
                  Hide {selectedActive.length}
                </Button>
              </Space>
            ),
            children: (
              <Table
                rowKey="key"
                size="small"
                expandable={expandable}
                columns={columns}
                dataSource={activeRows}
                rowClassName={(r) => (r.retailerArchived ? "crm-archived-row" : "")}
                rowSelection={{ selectedRowKeys: selectedActive, onChange: setSelectedActive, columnWidth: 36 }}
                scroll={{ x: 1280 }}
                pagination={{ defaultPageSize: 50, hideOnSinglePage: true }}
                onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: "pointer" } })}
                locale={{ emptyText: "No active accounts here yet. Use the down-arrow button on a row to move one here." }}
              />
            ),
          }]}
        />
      )}

      {rows && (
        <Collapse
          style={{ marginTop: 16 }}
          items={[{
            key: "hidden",
            label: (
              <span>
                <EyeInvisibleOutlined /> Hidden ({hiddenRows.length})
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  Buyers you're not chasing right now. Their history is kept; bring them back any time.
                </Typography.Text>
              </span>
            ),
            extra: selectedHidden.length > 0 && (
              <Button size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); moveTo(idsFor(selectedHidden, hiddenRows), "list"); }}>
                Bring back {selectedHidden.length}
              </Button>
            ),
            children: (
              <Table
                rowKey="key"
                size="small"
                expandable={expandable}
                columns={columns}
                dataSource={hiddenRows}
                rowClassName="crm-archived-row"
                rowSelection={{ selectedRowKeys: selectedHidden, onChange: setSelectedHidden, columnWidth: 36 }}
                scroll={{ x: 1280 }}
                pagination={{ defaultPageSize: 50, hideOnSinglePage: true }}
                onRow={(r) => ({ onClick: () => setOpenId(r.id), style: { cursor: "pointer" } })}
                locale={{ emptyText: "Nothing hidden. Use the eye button on a row to park a buyer here." }}
              />
            ),
          }]}
        />
      )}

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

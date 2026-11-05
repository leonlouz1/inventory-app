import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Input, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { CheckOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { STATUS_COLORS } from "../../constants/crm";
import ContactDrawer, { PhoneLinks } from "../../components/crm/ContactDrawer";
import PitchModal from "../../components/crm/PitchModal";

// Buyers pitched categories we don't know they buy. When they answer, "Buys it"
// moves the category onto their real list; "Doesn't buy" drops the pitch.
export default function CrmPitches() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => crmApi.listPitches()
    .then((r) => { setRows(r); setError(null); })
    .catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((c) => !term
      || `${c.name} ${c.retailerName} ${c.email || ""} ${c.pitchedCategories.join(" ")}`.toLowerCase().includes(term));
  }, [rows, search]);

  async function answer(c, category, buys) {
    try {
      await crmApi.pitchResult(c.id, category, buys);
      message.success(buys ? `${c.name} moved to the ${category} list` : `${category} pitch to ${c.name} closed`);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (error) return <Alert type="error" message={error} showIcon />;

  const today = dayjs().format("YYYY-MM-DD");
  const columns = [
    {
      title: "Name", dataIndex: "name", width: 160,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v) => <a style={{ fontWeight: 500 }}>{v}</a>,
    },
    {
      title: "Retailer", dataIndex: "retailerName", width: 140,
      sorter: (a, b) => a.retailerName.localeCompare(b.retailerName),
      render: (v, c) => <Link to={`/crm/accounts/${c.retailerId}`} onClick={(e) => e.stopPropagation()}>{v}</Link>,
    },
    {
      title: "Pitched", dataIndex: "pitchedCategories", width: 280,
      render: (cats, c) => (
        <Space direction="vertical" size={4} onClick={(e) => e.stopPropagation()}>
          {cats.map((cat) => (
            <Space key={cat} size={4}>
              <Tag color="cyan" style={{ margin: 0, minWidth: 70 }}>{cat}</Tag>
              <Popconfirm title={`${c.name} buys ${cat}?`} description={`Moves them to the ${cat} list.`} okText="Yes, move" onConfirm={() => answer(c, cat, true)}>
                <Button size="small" icon={<CheckOutlined />} style={{ color: "#389e0d" }}>Buys it</Button>
              </Popconfirm>
              <Popconfirm title={`${c.name} doesn't buy ${cat}?`} description="Drops this pitch." okText="Yes" onConfirm={() => answer(c, cat, false)}>
                <Button size="small" icon={<CloseOutlined />} danger>Doesn't</Button>
              </Popconfirm>
            </Space>
          ))}
        </Space>
      ),
    },
    {
      title: "Confirmed", dataIndex: "categories", width: 120,
      render: (cats) => <Space size={2} wrap>{cats.map((c) => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}</Space>,
    },
    { title: "Status", dataIndex: "status", width: 110, render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    {
      title: "Last pitch / note", dataIndex: "lastActivity", width: 260,
      sorter: (a, b) => (a.lastActivity?.date || "").localeCompare(b.lastActivity?.date || ""),
      render: (l) => (l ? (
        <Tooltip title={l.notes}>
          <div style={{ fontSize: 12 }}>
            <Typography.Text type="secondary">{dayjs(l.date).format("MMM D")} · {l.actionTaken}</Typography.Text>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{l.notes}</div>
          </div>
        </Tooltip>
      ) : <Typography.Text type="secondary">Never</Typography.Text>),
    },
    {
      title: "Follow up", dataIndex: "nextFollowUp", width: 100,
      defaultSortOrder: "ascend",
      sorter: (a, b) => (a.nextFollowUp || "9999").localeCompare(b.nextFollowUp || "9999"),
      render: (d) => (d ? <Typography.Text type={d <= today ? "danger" : undefined}>{dayjs(d).format("MMM D")}</Typography.Text> : null),
    },
    {
      title: "Contact", key: "contact", width: 220,
      render: (_, c) => (
        <div style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
          {c.email && <div><a href={`mailto:${c.email}`}>{c.email}</a></div>}
          <PhoneLinks contact={c} size={12} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Pitches <span style={{ color: "#aaa", fontWeight: 400, fontSize: 15 }}>({filtered.length})</span>
          </Typography.Title>
          <Typography.Text type="secondary">Buyers pitched a category we don't know they buy yet.</Typography.Text>
        </div>
        <Space wrap>
          <Input.Search placeholder="Search name, retailer, category" allowClear style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>New pitch</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={rows === null}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1400 }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["25", "50", "100", "200"] }}
        onRow={(c) => ({ onClick: () => setOpenId(c.id), style: { cursor: "pointer" } })}
      />
      {openId && <ContactDrawer key={openId} contactId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      <PitchModal open={adding} onClose={() => setAdding(false)} onSaved={load} />
    </>
  );
}

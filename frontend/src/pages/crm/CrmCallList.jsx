import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert, Button, DatePicker, Empty, Input, Modal, Popconfirm, Radio, Segmented, Space, Table, Tag, Tooltip, Typography, message,
} from "antd";
import { CloseOutlined, PhoneOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { CRM_CATEGORIES, STATUS_COLORS, defaultFollowUp } from "../../constants/crm";
import ContactDrawer, { PhoneLinks } from "../../components/crm/ContactDrawer";

const OUTCOMES = [
  { value: "reached", label: "Spoke to them" },
  { value: "voicemail", label: "Left voicemail" },
  { value: "no-answer", label: "No answer" },
];

// The category a row is for: the one they were added from, else their first buying one
function rowCategory(c) {
  return c.callListCategory || c.categories.find((x) => CRM_CATEGORIES.includes(x)) || c.categories[0] || null;
}

// Log a call from the list. Speaking to them takes them off the list;
// voicemail / no answer logs the attempt and keeps them on it.
function CalledModal({ contact, onClose, onSaved }) {
  const [outcome, setOutcome] = useState("reached");
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState(defaultFollowUp("Called"));
  const [saving, setSaving] = useState(false);
  const keep = outcome !== "reached";

  async function save() {
    setSaving(true);
    try {
      const prefix = OUTCOMES.find((o) => o.value === outcome).label;
      const category = rowCategory(contact);
      await crmApi.log({
        contactIds: [contact.id],
        action: "Called",
        note: keep ? `${prefix}${note.trim() ? `: ${note.trim()}` : ""}` : note,
        ...(category && contact.categories.includes(category) && { category }),
        nextFollowUp: followUp ? followUp.format("YYYY-MM-DD") : null,
        keepOnCallList: keep,
      });
      message.success(keep ? `Call logged, ${contact.name} stays on the list` : `Call logged, ${contact.name} taken off the list`);
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Called ${contact.name} · ${contact.retailerName}`}
      onCancel={onClose}
      onOk={save}
      okText="Log call"
      confirmLoading={saving}
    >
      <Space direction="vertical" style={{ width: "100%" }} size={12}>
        <Radio.Group optionType="button" buttonStyle="solid" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={OUTCOMES} />
        <Input.TextArea
          autoFocus
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={keep ? "Anything to add (optional)" : "What did they say?"}
        />
        <Space>
          <Typography.Text type="secondary">Next follow-up</Typography.Text>
          <DatePicker value={followUp} onChange={setFollowUp} placeholder="None" />
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {keep ? "They stay on the call list." : "Logged on their history and taken off the call list."}
        </Typography.Text>
      </Space>
    </Modal>
  );
}

// Buyers queued for cold calling, coldest (oldest last update) first.
// Added from a buyer's panel with "Add to call list".
export default function CrmCallList() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [openId, setOpenId] = useState(null);
  const [calling, setCalling] = useState(null);

  const load = useCallback(() => crmApi.callList()
    .then((r) => { setRows(r); setError(null); })
    .catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || [])
      .filter((c) => category === "All" || rowCategory(c) === category || c.categories.includes(category))
      .filter((c) => !term || `${c.name} ${c.retailerName} ${c.callListNote || ""}`.toLowerCase().includes(term));
  }, [rows, search, category]);

  async function remove(c) {
    try {
      await crmApi.removeFromCallList(c.id);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (error) return <Alert type="error" message={error} showIcon />;

  const lastDate = (c) => c.lastActivity?.date || "";
  const columns = [
    {
      title: "Name", dataIndex: "name", width: 150,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v, c) => (
        <div>
          <a style={{ fontWeight: 500 }}>{v}</a>
          {c.title && <div style={{ fontSize: 12, color: "#999" }}>{c.title}</div>}
        </div>
      ),
    },
    {
      title: "Company", dataIndex: "retailerName", width: 140,
      sorter: (a, b) => a.retailerName.localeCompare(b.retailerName),
      render: (v, c) => <Link to={`/crm/accounts/${c.retailerId}`} onClick={(e) => e.stopPropagation()}>{v}</Link>,
    },
    {
      title: "Category", key: "category", width: 90,
      render: (_, c) => (rowCategory(c) ? <Tag color="blue" style={{ margin: 0 }}>{rowCategory(c)}</Tag> : null),
    },
    { title: "Status", dataIndex: "status", width: 110, render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    {
      title: "Last update", key: "last", width: 220,
      defaultSortOrder: "ascend",
      sorter: (a, b) => lastDate(a).localeCompare(lastDate(b)),
      render: (_, c) => {
        const l = c.lastActivity;
        if (!l) return <Typography.Text type="secondary">Never</Typography.Text>;
        return (
          <Tooltip title={l.notes}>
            <div style={{ fontSize: 12 }}>
              <Typography.Text type="secondary">{dayjs(l.date).format("MMM D, YYYY")} · {l.actionTaken}</Typography.Text>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{l.notes}</div>
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: "Phone", key: "phone", width: 200,
      render: (_, c) => (
        <div onClick={(e) => e.stopPropagation()}>
          {c.directPhone || c.mobilePhone || c.hqPhone
            ? <PhoneLinks contact={c} size={13} />
            : <Typography.Text type="secondary" style={{ fontSize: 12 }}>No number</Typography.Text>}
        </div>
      ),
    },
    {
      title: "Why call", dataIndex: "callListNote",
      render: (v, c) => (
        <div style={{ fontSize: 12 }}>
          {v && <div style={{ whiteSpace: "pre-wrap" }}>{v}</div>}
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>Added {dayjs(c.callListAt).format("MMM D")}</Typography.Text>
        </div>
      ),
    },
    {
      title: "", key: "actions", width: 130, fixed: "right",
      render: (_, c) => (
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Button size="small" type="primary" icon={<PhoneOutlined />} onClick={() => setCalling(c)}>Called</Button>
          <Popconfirm title={`Take ${c.name} off the call list?`} okText="Remove" onConfirm={() => remove(c)}>
            <Tooltip title="Remove from list"><Button size="small" icon={<CloseOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Call List <span style={{ color: "#aaa", fontWeight: 400, fontSize: 15 }}>({filtered.length})</span>
          </Typography.Title>
          <Typography.Text type="secondary">Buyers to cold call, longest since last update first. Add people from their panel.</Typography.Text>
        </div>
        <Input.Search placeholder="Search name, company" allowClear style={{ width: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Segmented
        style={{ marginBottom: 12, maxWidth: "100%", overflowX: "auto" }}
        value={category}
        onChange={setCategory}
        options={["All", ...CRM_CATEGORIES]}
      />
      <Table
        rowKey="id"
        size="small"
        loading={rows === null}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1150 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No one to call. Open a buyer and click Add to call list." /> }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["25", "50", "100", "200"] }}
        onRow={(c) => ({ onClick: () => setOpenId(c.id), style: { cursor: "pointer" } })}
      />
      {openId && (
        <ContactDrawer
          key={openId}
          contactId={openId}
          category={rows?.find((r) => r.id === openId) ? rowCategory(rows.find((r) => r.id === openId)) : undefined}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
      {calling && <CalledModal contact={calling} onClose={() => setCalling(null)} onSaved={load} />}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Checkbox, DatePicker, Input, Modal, Radio, Select, Space, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { CRM_CATEGORIES, LOG_ACTIONS, STATUSES, STATUS_COLORS, defaultFollowUp, statusAfter } from "../../constants/crm";

// One action + note logged on many people at once, e.g. the same linesheet
// emailed to ten buyers. Each person gets their own history entry, and
// buyers' statuses move by the usual rules.
export default function BulkLogModal({ open, onClose, onLogged }) {
  const [contacts, setContacts] = useState([]);
  const [action, setAction] = useState("Emailed");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(dayjs());
  const [followUp, setFollowUp] = useState(defaultFollowUp("Emailed"));
  const [category, setCategory] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [search, setSearch] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) crmApi.listContacts().then(setContacts).catch((err) => message.error(err.message));
  }, [open]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (!everyone && c.role !== "Buyer") return false;
      if (category && !c.categories.includes(category)) return false;
      if (statuses.length && !statuses.includes(c.status)) return false;
      if (term && !`${c.name} ${c.retailerName}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [contacts, everyone, category, statuses, search]);

  function pickAction(a) {
    setAction(a);
    setFollowUp(defaultFollowUp(a, date));
  }

  async function save() {
    if (!selected.length) {
      message.warning("Tick at least one person");
      return;
    }
    setSaving(true);
    try {
      const { logged } = await crmApi.log({
        contactIds: selected,
        action,
        note,
        date: date.format("YYYY-MM-DD"),
        category: category || undefined,
        nextFollowUp: followUp ? followUp.format("YYYY-MM-DD") : null,
      });
      message.success(`Logged on ${logged} ${logged === 1 ? "person" : "people"}`);
      setSelected([]);
      setNote("");
      onLogged?.();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Log for several people"
      open={open}
      onCancel={onClose}
      onOk={save}
      okText={`Log on ${selected.length} ${selected.length === 1 ? "person" : "people"}`}
      confirmLoading={saving}
      width={960}
      destroyOnHidden
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Radio.Group optionType="button" buttonStyle="solid" value={action} onChange={(e) => pickAction(e.target.value)}
          options={LOG_ACTIONS.map((a) => ({ value: a, label: a }))} />
        <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Sent Q1 storage linesheet with new pricing" />
        <Space wrap>
          <span>Date <DatePicker allowClear={false} value={date} onChange={setDate} /></span>
          <span>Follow up <DatePicker value={followUp} onChange={setFollowUp} placeholder="None" /></span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Sets every ticked buyer's next follow-up. Statuses update automatically.
          </Typography.Text>
        </Space>

        <Space wrap style={{ marginTop: 6 }}>
          <Select placeholder="Category" allowClear style={{ width: 140 }} value={category} onChange={(v) => setCategory(v ?? null)}
            options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Select mode="multiple" placeholder="Status" allowClear style={{ minWidth: 170 }} maxTagCount="responsive"
            value={statuses} onChange={setStatuses} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Input.Search placeholder="Search name or retailer" allowClear style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Checkbox checked={everyone} onChange={(e) => setEveryone(e.target.checked)}>Include non-buyers</Checkbox>
          <Typography.Text type="secondary">{selected.length} ticked</Typography.Text>
        </Space>

        <Table
          size="small"
          rowKey="id"
          dataSource={visible}
          pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "25", "50", "100"], size: "small" }}
          rowSelection={{
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: setSelected,
            selections: [
              { key: "all-filtered", text: `Tick all ${visible.length} shown`, onSelect: () => setSelected([...new Set([...selected, ...visible.map((c) => c.id)])]) },
              { key: "none", text: "Clear ticks", onSelect: () => setSelected([]) },
            ],
          }}
          onRow={(c) => ({
            // Clicking anywhere on the row ticks it; the checkbox cell handles itself
            onClick: (e) => {
              if (e.target.closest(".ant-table-selection-column")) return;
              setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]));
            },
            style: { cursor: "pointer" },
          })}
          columns={[
            { title: "Retailer", dataIndex: "retailerName", sorter: (a, b) => a.retailerName.localeCompare(b.retailerName) },
            { title: "Name", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
            { title: "Role", dataIndex: "role", width: 110 },
            { title: "Categories", dataIndex: "categories", render: (cats) => cats.join(", ") },
            {
              title: "Status now → after", key: "status", width: 230,
              render: (_, c) => {
                if (c.role !== "Buyer") return null;
                const next = statusAfter(action, c.status);
                return (
                  <Space size={2}>
                    <Tag color={STATUS_COLORS[c.status]}>{c.status}</Tag>
                    {next !== c.status && <>→ <Tag color={STATUS_COLORS[next]}>{next}</Tag></>}
                  </Space>
                );
              },
            },
          ]}
        />
      </Space>
    </Modal>
  );
}

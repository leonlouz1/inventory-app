import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button, DatePicker, Divider, Drawer, Empty, Input, Modal, Popconfirm, Select, Space, Spin, Tag, Timeline, Typography, message,
} from "antd";
import { DeleteOutlined, EditOutlined, FilePdfOutlined, MailOutlined, PaperClipOutlined, PhoneOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { ACTION_COLORS, ACTION_LABELS, LOG_ACTIONS, STATUSES, STATUS_COLORS } from "../../constants/crm";
import ContactFormModal from "./ContactFormModal";
import LogForm, { RecapFields } from "./LogForm";
import { fileToUpload, openCrmAttachment } from "../../utils/crmFiles";

function AttachmentLink({ file }) {
  const Icon = file.contentType === "application/pdf" ? FilePdfOutlined : PaperClipOutlined;
  return (
    <a onClick={() => openCrmAttachment(file).catch((err) => message.error(err.message))}>
      <Icon /> {file.filename}
    </a>
  );
}

export function PhoneLinks({ contact, size = 13 }) {
  const phones = [
    ["Direct", contact.directPhone],
    ["Mobile", contact.mobilePhone],
    ["HQ", contact.hqPhone],
  ].filter(([, n]) => n);
  if (!phones.length) return null;
  return (
    <Space size={[12, 2]} wrap style={{ fontSize: size }}>
      {phones.map(([label, n]) => (
        <span key={label}>
          <Typography.Text type="secondary" style={{ fontSize: size - 1 }}>{label} </Typography.Text>
          <a href={`tel:${n.replace(/[^\d+x]/gi, "")}`} onClick={(e) => e.stopPropagation()}>{n}</a>
        </span>
      ))}
    </Space>
  );
}

function EditEntryModal({ entry, onClose, onSaved }) {
  const [action, setAction] = useState(entry.actionTaken);
  const [date, setDate] = useState(dayjs(entry.date));
  const [notes, setNotes] = useState(entry.notes || "");
  const [recap, setRecap] = useState(entry.recap || "");
  const [newFile, setNewFile] = useState(null);
  const [files, setFiles] = useState(entry.attachments || []);
  const [saving, setSaving] = useState(false);
  const showRecap = action === "Meeting" || entry.recap || files.length > 0;

  async function removeFile(f) {
    try {
      await crmApi.deleteAttachment(f.id);
      setFiles((list) => list.filter((x) => x.id !== f.id));
      onSaved();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await crmApi.updateActivity(entry.id, { actionTaken: action, date: date.format("YYYY-MM-DD"), notes, recap });
      if (newFile) await crmApi.addAttachment(entry.id, await fileToUpload(newFile));
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }
  const actions = entry.actionTaken === "Note" ? [...LOG_ACTIONS, "Note"] : LOG_ACTIONS;
  return (
    <Modal open title="Edit entry" onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving}>
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Select value={action} onChange={setAction} style={{ width: 150 }}
            options={actions.map((a) => ({ value: a, label: ACTION_LABELS[a] || a }))} />
          <DatePicker allowClear={false} value={date} onChange={setDate} />
        </Space>
        <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {showRecap && (
          <>
            <Typography.Text strong>Meeting recap</Typography.Text>
            {files.map((f) => (
              <Space key={f.id} size={4}>
                <AttachmentLink file={f} />
                <Popconfirm title={`Remove ${f.filename}?`} onConfirm={() => removeFile(f)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ))}
            <RecapFields recap={recap} onRecap={setRecap} file={newFile} onFile={setNewFile} />
          </>
        )}
      </Space>
    </Modal>
  );
}

// Side panel for one person: details, team and the full history chain.
// `category` is the work list it was opened from, used to tag new entries.
export default function ContactDrawer({ contactId, category, onClose, onChanged }) {
  const [id, setId] = useState(contactId);
  const [data, setData] = useState(null);
  const [retailerContacts, setRetailerContacts] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const load = useCallback(() => crmApi.getContact(id)
    .then((c) => {
      setData(c);
      return crmApi.listContacts(c.retailerId).then(setRetailerContacts);
    })
    .catch((err) => message.error(err.message)), [id]);

  useEffect(() => { load(); }, [load]);

  function changed() {
    load();
    onChanged?.();
  }

  async function update(fields) {
    try {
      await crmApi.updateContact(data.id, fields);
      changed();
    } catch (err) {
      message.error(err.message);
    }
  }

  const loaded = data && data.id === id;
  const ccOptions = retailerContacts
    .filter((c) => c.id !== id)
    .map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` }));

  return (
    <Drawer
      open
      width={600}
      onClose={onClose}
      title={loaded ? (
        <Space size={8} wrap>
          <span>{data.name}</span>
          <Tag>{data.role}</Tag>
          <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
            at <Link to={`/crm/accounts/${data.retailerId}`} onClick={onClose}>{data.retailerName}</Link>
          </Typography.Text>
        </Space>
      ) : "Loading…"}
      extra={loaded && (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>
          <Popconfirm
            title={`Delete ${data.name}?`}
            description="Their history is deleted too."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              await crmApi.deleteContact(data.id);
              onChanged?.();
              onClose();
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )}
    >
      {!loaded ? <Spin /> : (
        <>
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            <Space size={4} wrap>
              {data.categories.map((c) => <Tag key={c} color="blue">{c}</Tag>)}
              {data.title && <Typography.Text type="secondary">{data.title}</Typography.Text>}
            </Space>
            {data.email && (
              <a href={`mailto:${data.email}`}><MailOutlined /> {data.email}</a>
            )}
            {(data.directPhone || data.mobilePhone || data.hqPhone) && (
              <span><PhoneOutlined style={{ color: "#999", marginRight: 6 }} /><PhoneLinks contact={data} /></span>
            )}
            {data.notes && <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{data.notes}</Typography.Paragraph>}
            {data.role === "Buyer" && (
              <Space wrap style={{ marginTop: 4 }}>
                <span>
                  <Typography.Text type="secondary">Status </Typography.Text>
                  <Select
                    size="small"
                    value={data.status}
                    onChange={(status) => update({ status })}
                    options={STATUSES.map((s) => ({ value: s, label: <Tag color={STATUS_COLORS[s]}>{s}</Tag> }))}
                    style={{ width: 170 }}
                  />
                </span>
                <span>
                  <Typography.Text type="secondary">Next follow-up </Typography.Text>
                  <DatePicker
                    size="small"
                    value={data.nextFollowUp ? dayjs(data.nextFollowUp) : null}
                    onChange={(d) => update({ nextFollowUp: d ? d.format("YYYY-MM-DD") : null })}
                    placeholder="None"
                  />
                </span>
              </Space>
            )}
          </Space>

          <Divider orientation="left" plain style={{ margin: "16px 0 8px" }}>Log</Divider>
          <LogForm key={data.id} contact={data} ccOptions={ccOptions} category={category} onLogged={changed} />

          {data.team.length > 0 && (
            <>
              <Divider orientation="left" plain style={{ margin: "16px 0 8px" }}>Team</Divider>
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                {data.team.map((t) => (
                  <div key={t.id}>
                    <Space size={6} wrap>
                      <a onClick={() => setId(t.id)} style={{ fontWeight: 500 }}>{t.name}</a>
                      <Tag style={{ margin: 0 }}>{t.role}</Tag>
                      {t.title && t.title !== t.role && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t.title}</Typography.Text>}
                    </Space>
                    <div style={{ fontSize: 13 }}>
                      {t.email && <a href={`mailto:${t.email}`} style={{ marginRight: 12 }}>{t.email}</a>}
                      <PhoneLinks contact={t} size={12} />
                    </div>
                  </div>
                ))}
              </Space>
            </>
          )}

          <Divider orientation="left" plain style={{ margin: "16px 0 12px" }}>History ({data.history.length})</Divider>
          {data.history.length === 0 ? <Empty description="Nothing logged yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
            <Timeline
              items={data.history.map((h) => ({
                color: ACTION_COLORS[h.actionTaken] || "gray",
                children: (
                  <div className="crm-history-entry">
                    <Space size={6} wrap>
                      <strong>{dayjs(h.date).format("MMM D, YYYY")}</strong>
                      <Tag color={ACTION_COLORS[h.actionTaken]} style={{ margin: 0 }}>{ACTION_LABELS[h.actionTaken] || h.actionTaken}</Tag>
                      {h.category && <Tag style={{ margin: 0 }}>{h.category}</Tag>}
                      <span style={{ marginLeft: "auto" }}>
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditingEntry(h)} />
                        <Popconfirm title="Delete this entry?" onConfirm={async () => { await crmApi.deleteActivity(h.id); changed(); }}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </span>
                    </Space>
                    {h.notes && <div style={{ whiteSpace: "pre-wrap" }}>{h.notes}</div>}
                    {h.recap && (
                      <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 6, padding: "6px 10px", margin: "4px 0" }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Recap</Typography.Text>
                        <Typography.Paragraph
                          ellipsis={{ rows: 3, expandable: "collapsible", symbol: (open) => (open ? "Show less" : "Show all") }}
                          style={{ margin: 0, whiteSpace: "pre-wrap" }}
                        >
                          {h.recap}
                        </Typography.Paragraph>
                      </div>
                    )}
                    {h.attachments?.length > 0 && (
                      <Space size={12} wrap style={{ margin: "2px 0" }}>
                        {h.attachments.map((f) => <AttachmentLink key={f.id} file={f} />)}
                      </Space>
                    )}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {h.contactId !== data.id && `Logged on ${h.contactName} · `}
                      {h.ccNames.length > 0 && `With ${h.ccNames.join(", ")} · `}
                      {h.rep ? `by ${h.rep}` : ""}
                    </Typography.Text>
                  </div>
                ),
              }))}
            />
          )}

          <ContactFormModal open={editing} contact={data} onClose={() => setEditing(false)} onSaved={changed} />
          {editingEntry && <EditEntryModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSaved={changed} />}
        </>
      )}
    </Drawer>
  );
}

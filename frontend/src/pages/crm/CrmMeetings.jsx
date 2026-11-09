import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert, Badge, Button, Calendar, DatePicker, Descriptions, Empty, Input, Modal, Popconfirm, Segmented, Space, Table, Tag, Typography, message,
} from "antd";
import { CalendarOutlined, EnvironmentOutlined, LinkOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { MEETING_STATUS_COLORS, defaultFollowUp } from "../../constants/crm";
import ContactDrawer from "../../components/crm/ContactDrawer";
import { RecapFields } from "../../components/crm/LogForm";
import MeetingFields from "../../components/crm/MeetingFields";
import { meetingFromApi, meetingPayload, useTeamNames } from "../../utils/crmMeetings";
import { fileToUpload } from "../../utils/crmFiles";

const needsRecap = (m) => m.status === "Scheduled" && dayjs(m.startsAt).isBefore(dayjs());

function MeetingStatus({ m }) {
  if (needsRecap(m)) return <Tag color="red" style={{ margin: 0 }}>Needs recap</Tag>;
  return <Tag color={MEETING_STATUS_COLORS[m.status]} style={{ margin: 0 }}>{m.status}</Tag>;
}

function Where({ m }) {
  return (
    <span>
      {m.locationType}
      {m.locationType === "Buyer's office" && m.address && (
        <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
          <EnvironmentOutlined /> {m.address}
        </Typography.Text>
      )}
      {m.link && (
        <a href={m.link} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
          <LinkOutlined /> Join link
        </a>
      )}
    </span>
  );
}

const attendeeText = (m) => [m.contactName, ...m.attendees.map((a) => a.name)].join(", ");

// Log the recap of a meeting: a "Meeting" entry on the buyer's history, which marks the meeting done
function RecapModal({ meeting, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [recap, setRecap] = useState("");
  const [file, setFile] = useState(null);
  const [date, setDate] = useState(dayjs(meeting.startsAt));
  // A week after the meeting, or after today if that's already gone by
  const [followUp, setFollowUp] = useState(() => defaultFollowUp("Meeting", dayjs(meeting.startsAt).isAfter(dayjs()) ? dayjs(meeting.startsAt) : dayjs()));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await crmApi.log({
        contactIds: [meeting.contactId],
        ccContactIds: meeting.attendees.map((a) => a.id),
        action: "Meeting",
        meetingId: meeting.id,
        note,
        recap: recap || null,
        ...(file && { attachment: await fileToUpload(file) }),
        date: date.format("YYYY-MM-DD"),
        category: meeting.category,
        nextFollowUp: followUp ? followUp.format("YYYY-MM-DD") : null,
      });
      message.success("Recap logged");
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`Meeting recap · ${meeting.contactName}, ${meeting.retailerName}`} onCancel={onClose} onOk={save} okText="Log recap" confirmLoading={saving} width={620}>
      <Input.TextArea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Short summary, e.g. Liked the Bath line, wants pricing on 3 SKUs"
        style={{ marginBottom: 8 }}
      />
      <RecapFields recap={recap} onRecap={setRecap} file={file} onFile={setFile} />
      <Space wrap>
        <span><Typography.Text type="secondary">Date </Typography.Text><DatePicker allowClear={false} value={date} onChange={setDate} /></span>
        <span><Typography.Text type="secondary">Next follow-up </Typography.Text><DatePicker value={followUp} onChange={setFollowUp} placeholder="None" /></span>
      </Space>
    </Modal>
  );
}

// Change a meeting's time, place, attendees or notes
function EditMeetingModal({ meeting, onClose, onSaved }) {
  const [value, setValue] = useState(() => meetingFromApi(meeting));
  const [notes, setNotes] = useState(meeting.notes || "");
  const [options, setOptions] = useState([]);
  const [retailerAddress, setRetailerAddress] = useState(null);
  const [saving, setSaving] = useState(false);
  const teamNames = useTeamNames();

  useEffect(() => {
    crmApi.listContacts(meeting.retailerId)
      .then((list) => setOptions(list.filter((c) => c.id !== meeting.contactId).map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` }))))
      .catch(() => {});
    crmApi.getContact(meeting.contactId).then((c) => setRetailerAddress(c.retailerAddress)).catch(() => {});
  }, [meeting]);

  async function save() {
    setSaving(true);
    try {
      await crmApi.updateMeeting(meeting.id, { ...meetingPayload(value), notes });
      message.success(value.startsAt.isSame(dayjs(meeting.startsAt)) ? "Meeting updated" : "Meeting rescheduled");
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`Edit meeting · ${meeting.contactName}, ${meeting.retailerName}`} onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving} width={620}>
      <MeetingFields value={value} onChange={setValue} attendeeOptions={options} teamNames={teamNames} retailerAddress={retailerAddress} size="middle" />
      <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What's it about?" />
    </Modal>
  );
}

function MeetingDetail({ meeting, onClose, onChanged, onOpenBuyer, onEdit, onRecap }) {
  const m = meeting;
  async function setStatus(status) {
    try {
      await crmApi.updateMeeting(m.id, { status });
      onChanged();
      onClose();
    } catch (err) {
      message.error(err.message);
    }
  }
  async function remove() {
    try {
      await crmApi.deleteMeeting(m.id);
      onChanged();
      onClose();
    } catch (err) {
      message.error(err.message);
    }
  }
  const footer = [
    <Popconfirm key="del" title="Delete this meeting?" description="Use this for one booked by mistake. Its history entry is deleted too." okText="Delete" okButtonProps={{ danger: true }} onConfirm={remove}>
      <Button danger type="text">Delete</Button>
    </Popconfirm>,
    m.status === "Scheduled" && (
      <Popconfirm key="cancel" title="Cancel this meeting?" description="Noted on the buyer's history." okText="Cancel meeting" onConfirm={() => setStatus("Cancelled")}>
        <Button>Cancel meeting</Button>
      </Popconfirm>
    ),
    m.status !== "Done" && <Button key="edit" onClick={onEdit}>{m.status === "Cancelled" ? "Rebook" : "Edit / reschedule"}</Button>,
    m.status === "Scheduled" && <Button key="recap" type="primary" onClick={onRecap}>Log recap</Button>,
  ].filter(Boolean);

  return (
    <Modal open onCancel={onClose} footer={footer} width={620} title={(
      <Space wrap size={8}>
        <span>Meeting with {m.contactName}</span>
        <MeetingStatus m={m} />
      </Space>
    )}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="When">{dayjs(m.startsAt).format("dddd, MMM D, YYYY · h:mm A")}</Descriptions.Item>
        <Descriptions.Item label="Where"><Where m={m} /></Descriptions.Item>
        <Descriptions.Item label="Buyer">
          <a onClick={onOpenBuyer}>{m.contactName}</a>
          {" at "}<Link to={`/crm/accounts/${m.retailerId}`}>{m.retailerName}</Link>
          {m.category && <Tag style={{ marginLeft: 8 }}>{m.category}</Tag>}
        </Descriptions.Item>
        <Descriptions.Item label="Their side">{attendeeText(m)}</Descriptions.Item>
        <Descriptions.Item label="Our side">{m.ourAttendees.join(", ") || <Typography.Text type="secondary">No one added</Typography.Text>}</Descriptions.Item>
        {m.notes && <Descriptions.Item label="Notes"><span style={{ whiteSpace: "pre-wrap" }}>{m.notes}</span></Descriptions.Item>}
        {m.rep && <Descriptions.Item label="Booked by">{m.rep}</Descriptions.Item>}
      </Descriptions>
      {m.status === "Done" && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          The recap is on <a onClick={onOpenBuyer}>{m.contactName}&apos;s history</a>.
        </Typography.Paragraph>
      )}
    </Modal>
  );
}

// CRM → Meetings: every meeting booked from a buyer's panel ("Meeting Scheduled"),
// on a calendar or as upcoming / past lists.
export default function CrmMeetings() {
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("Calendar");
  const [showCancelled, setShowCancelled] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [recapId, setRecapId] = useState(null);
  const [buyerId, setBuyerId] = useState(null);

  const load = useCallback(() => crmApi.listMeetings()
    .then((r) => { setMeetings(r); setError(null); })
    .catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (meetings || []).filter((m) => showCancelled || m.status !== "Cancelled"), [meetings, showCancelled]);
  const now = dayjs();
  const upcoming = visible.filter((m) => !dayjs(m.startsAt).isBefore(now));
  const past = visible.filter((m) => dayjs(m.startsAt).isBefore(now)).reverse();
  const missingRecap = (meetings || []).filter(needsRecap);
  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of visible) {
      const k = dayjs(m.startsAt).format("YYYY-MM-DD");
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    }
    return map;
  }, [visible]);

  const find = (id) => meetings?.find((m) => m.id === id);
  const open = find(openId);
  const editing = find(editingId);
  const recapping = find(recapId);

  if (error) return <Alert type="error" message={error} showIcon />;

  const columns = [
    {
      title: "When", dataIndex: "startsAt", width: 170,
      render: (d) => (
        <div>
          <strong>{dayjs(d).format("ddd MMM D, YYYY")}</strong>
          <div style={{ fontSize: 12, color: "#888" }}>{dayjs(d).format("h:mm A")}</div>
        </div>
      ),
    },
    {
      title: "Buyer", key: "buyer", width: 190,
      render: (_, m) => (
        <div>
          <span style={{ fontWeight: 500 }}>{m.contactName}</span>
          <div style={{ fontSize: 12, color: "#888" }}>{m.retailerName}</div>
        </div>
      ),
    },
    { title: "Category", dataIndex: "category", width: 100, render: (c) => (c ? <Tag style={{ margin: 0 }}>{c}</Tag> : null) },
    { title: "Where", key: "where", width: 220, render: (_, m) => <Where m={m} /> },
    {
      title: "Attendees", key: "people",
      render: (_, m) => (
        <div style={{ fontSize: 12 }}>
          <div>{attendeeText(m)}</div>
          {m.ourAttendees.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Us: {m.ourAttendees.join(", ")}</Typography.Text>}
        </div>
      ),
    },
    { title: "Status", key: "status", width: 110, render: (_, m) => <MeetingStatus m={m} /> },
  ];

  const list = (rows, emptyText) => (
    <Table
      rowKey="id"
      size="small"
      loading={meetings === null}
      columns={columns}
      dataSource={rows}
      scroll={{ x: 1000 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} /> }}
      pagination={{ defaultPageSize: 50, hideOnSinglePage: true }}
      onRow={(m) => ({ onClick: () => setOpenId(m.id), style: { cursor: "pointer" } })}
    />
  );

  function cellRender(current, info) {
    if (info.type === "month") {
      const n = visible.filter((m) => dayjs(m.startsAt).isSame(current, "month")).length;
      return n ? <Badge count={n} color="magenta" /> : null;
    }
    if (info.type !== "date") return info.originNode;
    const day = byDay.get(current.format("YYYY-MM-DD")) || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {day.map((m) => (
          <div
            key={m.id}
            onClick={(e) => { e.stopPropagation(); setOpenId(m.id); }}
            title={`${m.contactName} · ${m.retailerName} · ${m.locationType}`}
            className="crm-meeting-chip"
            style={{
              fontSize: 11, lineHeight: "16px", padding: "1px 4px", borderRadius: 4, cursor: "pointer",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              background: needsRecap(m) ? "#fff1f0" : m.status === "Done" ? "#f6ffed" : m.status === "Cancelled" ? "#fafafa" : "#fff0f6",
              color: m.status === "Cancelled" ? "#999" : "inherit",
              textDecoration: m.status === "Cancelled" ? "line-through" : "none",
              borderLeft: `3px solid ${needsRecap(m) ? "#ff4d4f" : m.status === "Done" ? "#52c41a" : m.status === "Cancelled" ? "#d9d9d9" : "#eb2f96"}`,
            }}
          >
            {dayjs(m.startsAt).format("h:mma")} {m.retailerName}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <CalendarOutlined /> Meetings
          </Typography.Title>
          <Typography.Text type="secondary">Book one from a buyer&apos;s panel: Log → Meeting Scheduled.</Typography.Text>
        </div>
        <Space wrap>
          <Segmented
            value={view}
            onChange={setView}
            options={["Calendar", `Upcoming (${upcoming.length})`, `Past (${past.length})`].map((l) => ({ value: l.split(" (")[0], label: l }))}
          />
          <Button size="small" type={showCancelled ? "primary" : "default"} ghost={showCancelled} onClick={() => setShowCancelled((v) => !v)}>
            {showCancelled ? "Hide cancelled" : "Show cancelled"}
          </Button>
        </Space>
      </div>

      {missingRecap.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${missingRecap.length} past meeting${missingRecap.length === 1 ? "" : "s"} still need${missingRecap.length === 1 ? "s" : ""} a recap`}
          description={(
            <Space size={[12, 4]} wrap>
              {missingRecap.map((m) => (
                <a key={m.id} onClick={() => setOpenId(m.id)}>
                  {m.contactName} · {m.retailerName} ({dayjs(m.startsAt).format("MMM D")})
                </a>
              ))}
            </Space>
          )}
        />
      )}

      {view === "Calendar" && (
        <div style={{ background: "#fff", borderRadius: 8, padding: "0 12px" }}>
          <Calendar cellRender={cellRender} />
        </div>
      )}
      {view === "Upcoming" && list(upcoming, "No upcoming meetings")}
      {view === "Past" && list(past, "No past meetings")}

      {open && (
        <MeetingDetail
          meeting={open}
          onClose={() => setOpenId(null)}
          onChanged={load}
          onOpenBuyer={() => { setBuyerId(open.contactId); setOpenId(null); }}
          onEdit={() => { setEditingId(open.id); setOpenId(null); }}
          onRecap={() => { setRecapId(open.id); setOpenId(null); }}
        />
      )}
      {editing && <EditMeetingModal meeting={editing} onClose={() => setEditingId(null)} onSaved={load} />}
      {recapping && <RecapModal meeting={recapping} onClose={() => setRecapId(null)} onSaved={load} />}
      {buyerId && <ContactDrawer key={buyerId} contactId={buyerId} onClose={() => setBuyerId(null)} onChanged={load} />}
    </>
  );
}

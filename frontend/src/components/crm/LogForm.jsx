import { useState } from "react";
import { Button, DatePicker, Input, Radio, Select, Space, Typography, message } from "antd";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { LOG_ACTIONS, STATUSES, defaultFollowUp, statusAfter } from "../../constants/crm";

// Log an action on one person. Others on the same email/call go in "Also on it".
export default function LogForm({ contact, ccOptions = [], category, onLogged }) {
  const [action, setAction] = useState("Emailed");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(dayjs());
  const [cc, setCc] = useState([]);
  const [followUp, setFollowUp] = useState(defaultFollowUp("Emailed"));
  // null = follow the automatic rule for the chosen action
  const [statusOverride, setStatusOverride] = useState(null);
  const [saving, setSaving] = useState(false);

  const isBuyer = contact.role === "Buyer";
  const autoStatus = statusAfter(action, contact.status);
  const status = statusOverride ?? autoStatus;

  function pickAction(a) {
    setAction(a);
    setFollowUp(defaultFollowUp(a, date));
    setStatusOverride(null);
  }

  async function save() {
    setSaving(true);
    try {
      await crmApi.log({
        contactIds: [contact.id],
        ccContactIds: cc,
        action,
        note,
        date: date.format("YYYY-MM-DD"),
        category,
        ...(isBuyer && { status, nextFollowUp: followUp ? followUp.format("YYYY-MM-DD") : null }),
      });
      message.success("Logged");
      setNote("");
      setCc([]);
      onLogged?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 8, padding: 12 }}>
      <Radio.Group
        size="small"
        optionType="button"
        buttonStyle="solid"
        value={action}
        onChange={(e) => pickAction(e.target.value)}
        options={LOG_ACTIONS.map((a) => ({ value: a, label: a }))}
        style={{ marginBottom: 8, flexWrap: "wrap", display: "flex", rowGap: 4 }}
      />
      <Input.TextArea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What happened? e.g. Sent ATS, sent updated pricing, left voicemail"
        style={{ marginBottom: 8 }}
      />
      {ccOptions.length > 0 && (
        <Select
          mode="multiple"
          size="small"
          value={cc}
          onChange={setCc}
          placeholder="Also on it (cc'd, on the call)…"
          options={ccOptions}
          style={{ width: "100%", marginBottom: 8 }}
          optionFilterProp="label"
        />
      )}
      <Space wrap size={[12, 6]} style={{ width: "100%" }}>
        <span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Date </Typography.Text>
          <DatePicker size="small" allowClear={false} value={date} onChange={setDate} style={{ width: 120 }} />
        </span>
        {isBuyer && (
          <>
            <span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Follow up </Typography.Text>
              <DatePicker size="small" value={followUp} onChange={setFollowUp} placeholder="None" style={{ width: 120 }} />
            </span>
            <span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Status </Typography.Text>
              <Select
                size="small"
                value={status}
                onChange={setStatusOverride}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
                style={{ width: 140 }}
              />
            </span>
          </>
        )}
        <Button type="primary" size="small" loading={saving} onClick={save}>Log it</Button>
      </Space>
    </div>
  );
}

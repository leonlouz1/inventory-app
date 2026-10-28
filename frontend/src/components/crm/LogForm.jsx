import { useState } from "react";
import { Button, DatePicker, Input, Radio, Select, Space, Tag, Typography, Upload, message } from "antd";
import { FilePdfOutlined, SnippetsOutlined, UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { LOG_ACTIONS, STATUSES, defaultFollowUp, statusAfter } from "../../constants/crm";
import { fileToUpload } from "../../utils/crmFiles";

// Meeting recap: paste the text and/or attach the recap PDF
export function RecapFields({ recap, onRecap, file, onFile }) {
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return message.info("The clipboard is empty");
      onRecap(recap ? `${recap}\n\n${text}` : text);
    } catch {
      message.info("Couldn't read the clipboard. Click in the box and press ⌘V instead.");
    }
  }
  return (
    <div style={{ marginBottom: 8 }}>
      <Space size={8} wrap style={{ marginBottom: 6 }}>
        <Button size="small" icon={<SnippetsOutlined />} onClick={pasteFromClipboard}>Paste recap</Button>
        <Upload
          accept=".pdf,application/pdf"
          showUploadList={false}
          beforeUpload={(f) => { onFile(f); return false; }}
        >
          <Button size="small" icon={<UploadOutlined />}>{file ? "Replace PDF" : "Upload recap PDF"}</Button>
        </Upload>
        {file && (
          <Tag icon={<FilePdfOutlined />} closable onClose={() => onFile(null)} style={{ margin: 0 }}>{file.name}</Tag>
        )}
      </Space>
      <Input.TextArea
        autoSize={{ minRows: 3, maxRows: 12 }}
        value={recap}
        onChange={(e) => onRecap(e.target.value)}
        placeholder="Meeting recap: who was there, what they liked, next steps…"
      />
    </div>
  );
}

// Log an action on one person. Others on the same email/call go in "Also on it".
export default function LogForm({ contact, ccOptions = [], category, onLogged }) {
  const [action, setAction] = useState("Emailed");
  const [note, setNote] = useState("");
  const [recap, setRecap] = useState("");
  const [recapFile, setRecapFile] = useState(null);
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
        ...(action === "Meeting" && {
          recap: recap || null,
          ...(recapFile && { attachment: await fileToUpload(recapFile) }),
        }),
        date: date.format("YYYY-MM-DD"),
        category,
        ...(isBuyer && { status, nextFollowUp: followUp ? followUp.format("YYYY-MM-DD") : null }),
      });
      message.success("Logged");
      setNote("");
      setRecap("");
      setRecapFile(null);
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
      {action === "Meeting" && <RecapFields recap={recap} onRecap={setRecap} file={recapFile} onFile={setRecapFile} />}
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

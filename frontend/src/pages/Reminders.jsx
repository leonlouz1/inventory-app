import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { Alert, Button, Card, Empty, InputNumber, Select, Spin, Switch, Table, Tag, Typography, message } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { remindersApi } from "../api/inventory";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "../constants/orderStatuses";

const fmt = (iso) => (iso ? dayjs(iso).format("M/D/YY") : "—");

// Daily email (weekday mornings) listing orders that need someone to act:
// not routed and late or shipping soon, routed but not picked up, and cancel
// dates coming up. Everyone on the list gets the same email.
export default function Reminders() {
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  function loadPreview() {
    return remindersApi.preview().then(setPreview).catch((err) => message.error(err.message));
  }

  useEffect(() => {
    remindersApi.settings().then(setSettings).catch((err) => message.error(err.message));
    loadPreview();
  }, []);

  async function save(changes) {
    setSaving(true);
    try {
      setSettings(await remindersApi.saveSettings(changes));
      if ("upcomingDays" in changes || "cancelDays" in changes) loadPreview();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const result = await remindersApi.sendNow();
      message.success(`Sent to ${result.recipients} ${result.recipients === 1 ? "person" : "people"}`);
      setSettings(await remindersApi.settings());
    } catch (err) {
      message.error(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!settings) return <Spin style={{ display: "block", margin: "80px auto" }} />;

  const total = preview?.sections.reduce((n, s) => n + s.orders.length, 0) ?? 0;
  const columns = [
    { title: "Order", dataIndex: "orderNumber", render: (v, r) => <Link to={`/orders/${r.id}`}>{v}</Link> },
    { title: "Customer", dataIndex: "customer" },
    { title: "PO #", dataIndex: "customerPo", render: (v) => v || "—" },
    { title: "Status", dataIndex: "status", render: (s) => <Tag color={ORDER_STATUS_COLORS[s]}>{ORDER_STATUS_LABELS[s] || s}</Tag> },
    {
      title: "Ship date",
      dataIndex: "shipDate",
      render: (v, r) => <>{fmt(v)}{r.daysLate > 0 && <Typography.Text type="danger"> ({r.daysLate}d late)</Typography.Text>}</>,
    },
    {
      title: "Cancel date",
      dataIndex: "cancelDate",
      render: (v) => <>{fmt(v)}{v && v < preview.today && <Typography.Text type="danger"> (passed)</Typography.Text>}</>,
    },
    { title: "Units", dataIndex: "units", align: "right" },
  ];

  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>Reminders</Typography.Title>
      <Typography.Paragraph type="secondary">
        One email each weekday morning listing orders that need attention. Nothing is sent on days when the list is empty.
      </Typography.Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch checked={settings.enabled} loading={saving} onChange={(enabled) => save({ enabled })} />
            <span>{settings.enabled ? "Daily email is on" : "Daily email is off"}</span>
            {settings.lastSentOn && <Typography.Text type="secondary">· last sent {fmt(settings.lastSentOn)}</Typography.Text>}
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>Send to</div>
            <Select
              mode="tags"
              style={{ width: "100%", maxWidth: 560 }}
              placeholder="Type an email address and press Enter"
              value={settings.recipients}
              onChange={(recipients) => save({ recipients })}
              tokenSeparators={[",", " ", ";"]}
              open={false}
              suffixIcon={null}
            />
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <span>
              Warn about unrouted orders shipping in the next{" "}
              <InputNumber min={0} max={60} size="small" style={{ width: 64 }} value={settings.upcomingDays}
                onChange={(v) => v != null && save({ upcomingDays: v })} /> days
            </span>
            <span>
              Warn about cancel dates in the next{" "}
              <InputNumber min={0} max={60} size="small" style={{ width: 64 }} value={settings.cancelDays}
                onChange={(v) => v != null && save({ cancelDays: v })} /> days
            </span>
          </div>
          <div>
            <Button icon={<MailOutlined />} onClick={sendNow} loading={sending} disabled={!settings.recipients.length}>
              Send today&apos;s email now
            </Button>
          </div>
        </div>
      </Card>

      <Typography.Title level={5}>Today&apos;s email{preview ? ` · ${total} order${total === 1 ? "" : "s"}` : ""}</Typography.Title>
      {!preview ? <Spin /> : total === 0 ? (
        <Empty description="Nothing needs attention today" />
      ) : (
        preview.sections.filter((s) => s.orders.length).map((s) => (
          <div key={s.key} style={{ marginBottom: 20 }}>
            <Typography.Text strong>{s.title} ({s.orders.length})</Typography.Text>
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={s.orders}
              pagination={false}
              scroll={{ x: "max-content" }}
              style={{ marginTop: 6 }}
            />
          </div>
        ))
      )}
      {preview && total > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 8 }}
          message="An order shows up in more than one section when more than one thing applies, e.g. late and its cancel date is close."
        />
      )}
    </>
  );
}

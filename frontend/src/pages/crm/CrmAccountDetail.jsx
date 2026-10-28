import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert, Button, Card, Col, Empty, Form, Input, Row, Select, Space, Spin, Table, Tag, Timeline, Typography, message,
} from "antd";
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { ACTION_COLORS, ACTION_LABELS, CONTACT_CATEGORIES, STATUSES, STATUS_COLORS } from "../../constants/crm";
import ContactDrawer, { PhoneLinks } from "../../components/crm/ContactDrawer";
import ContactFormModal from "../../components/crm/ContactFormModal";

const PRIORITIES = ["3 - High", "2 - Medium", "1 - Low"];
const ROLE_ORDER = ["Buyer", "DMM", "MA/Assistant", "Accounts Payable", "Logistics", "Other"];

function BillingAddress({ retailer, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  async function save() {
    setSaving(true);
    try {
      const v = form.getFieldsValue();
      await crmApi.updateRetailer(retailer.id, {
        billingAddress: v.billingAddress || null, billingCity: v.billingCity || null,
        billingState: v.billingState || null, billingZip: v.billingZip || null,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card size="small" title="Billing address" extra={!editing && <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>}>
      {editing ? (
        <Form form={form} layout="vertical" size="small" initialValues={retailer}>
          <Form.Item name="billingAddress" label="Street"><Input /></Form.Item>
          <Row gutter={8}>
            <Col span={12}><Form.Item name="billingCity" label="City"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="billingState" label="State"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="billingZip" label="Zip"><Input /></Form.Item></Col>
          </Row>
          <Space>
            <Button type="primary" size="small" loading={saving} onClick={save}>Save</Button>
            <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
          </Space>
        </Form>
      ) : retailer.billingAddress ? (
        <div style={{ fontSize: 13, lineHeight: "22px" }}>
          <div>{retailer.billingAddress}</div>
          <div>{[retailer.billingCity, retailer.billingState, retailer.billingZip].filter(Boolean).join(", ")}</div>
        </div>
      ) : <Typography.Text type="secondary">None yet. It prints on order emails and invoices.</Typography.Text>}
    </Card>
  );
}

// People in one category: buyers with their status and last action, then their team
function CategorySection({ category, people, onOpen, onAdd }) {
  const sorted = [...people].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  return (
    <Card
      size="small"
      title={category}
      style={{ marginBottom: 16 }}
      extra={<Button size="small" type="text" icon={<PlusOutlined />} onClick={() => onAdd(category)}>Add person</Button>}
    >
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={sorted}
        onRow={(c) => ({ onClick: () => onOpen(c.id), style: { cursor: "pointer" } })}
        columns={[
          {
            title: "Name", dataIndex: "name", width: 170,
            render: (v, c) => (
              <Space direction="vertical" size={0}>
                <a style={{ fontWeight: c.role === "Buyer" ? 600 : 400 }}>{v}</a>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.role}{c.title && c.title !== c.role ? ` · ${c.title}` : ""}</Typography.Text>
              </Space>
            ),
          },
          { title: "Status", dataIndex: "status", width: 120, render: (s, c) => (c.role === "Buyer" ? <Tag color={STATUS_COLORS[s]}>{s}</Tag> : null) },
          {
            title: "Last action", key: "last",
            render: (_, c) => c.lastActivity ? (
              <div>
                <Space size={4}>
                  <span>{dayjs(c.lastActivity.date).format("MMM D")}</span>
                  <Tag color={ACTION_COLORS[c.lastActivity.actionTaken]} style={{ margin: 0 }}>
                    {ACTION_LABELS[c.lastActivity.actionTaken] || c.lastActivity.actionTaken}
                  </Tag>
                </Space>
                {c.lastActivity.notes && (
                  <Typography.Paragraph ellipsis={{ rows: 1 }} type="secondary" style={{ margin: 0, fontSize: 12 }}>{c.lastActivity.notes}</Typography.Paragraph>
                )}
              </div>
            ) : (c.role === "Buyer" ? <Typography.Text type="secondary">Never</Typography.Text> : null),
          },
          {
            title: "Follow-up", dataIndex: "nextFollowUp", width: 90,
            render: (d, c) => (c.role === "Buyer" && d ? dayjs(d).format("MMM D") : null),
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
        ]}
      />
    </Card>
  );
}

// Retailer page: each category with its buyer(s) and team, then everyone else
export default function CrmAccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [retailer, setRetailer] = useState(null);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(null); // category to add a person to
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const load = useCallback(() => crmApi.getRetailer(id)
    .then((r) => { setRetailer(r); setError(null); })
    .catch((err) => setError(err.message)), [id]);

  useEffect(() => {
    load();
    crmApi.listRetailerTypes().then((t) => setTypes(t.map((x) => x.name))).catch(() => {});
  }, [load]);

  async function update(fields) {
    try {
      await crmApi.updateRetailer(retailer.id, fields);
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  if (error) return <Alert type="error" message={error} showIcon />;
  if (!retailer) return <Spin style={{ display: "block", marginTop: 80 }} />;

  const contacts = retailer.contacts;
  const byCategory = CONTACT_CATEGORIES
    .map((cat) => ({ cat, people: contacts.filter((c) => c.categories.includes(cat)) }))
    .filter((g) => g.people.length);
  const uncategorized = contacts.filter((c) => !c.categories.length);
  const history = retailer.activityLogs.slice(0, 30);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)} />
          {editingName ? (
            <Space>
              <Input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)} style={{ width: 260 }}
                onPressEnter={() => { update({ name: nameValue.trim() }); setEditingName(false); }} />
              <Button type="primary" size="small" onClick={() => { update({ name: nameValue.trim() }); setEditingName(false); }}>Save</Button>
              <Button size="small" onClick={() => setEditingName(false)}>Cancel</Button>
            </Space>
          ) : (
            <Space size={4}>
              <Typography.Title level={4} style={{ margin: 0 }}>{retailer.name}</Typography.Title>
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setNameValue(retailer.name); setEditingName(true); }} />
            </Space>
          )}
          {retailer.archived && (
            <Space size={4}>
              <Tag color="default">Archived</Tag>
              <Button size="small" onClick={() => crmApi.archiveRetailer(retailer.id, false).then(load)}>Restore</Button>
            </Space>
          )}
          <Select size="small" placeholder="Type" value={retailer.type} style={{ width: 150 }} allowClear
            options={types.map((t) => ({ value: t, label: t }))} onChange={(type) => update({ type: type || null })} />
          <Select size="small" value={retailer.priority} style={{ width: 120 }}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))} onChange={(priority) => update({ priority })} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding("")}>Add person</Button>
      </div>

      <Row gutter={20}>
        <Col xs={24} xl={16}>
          {byCategory.length === 0 && uncategorized.length === 0 && (
            <Card size="small"><Empty description="No people yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /></Card>
          )}
          {byCategory.map(({ cat, people }) => (
            <CategorySection key={cat} category={cat} people={people} onOpen={setOpenId} onAdd={setAdding} />
          ))}
          {uncategorized.length > 0 && (
            <CategorySection category="No category" people={uncategorized} onOpen={setOpenId} onAdd={() => setAdding("")} />
          )}
        </Col>
        <Col xs={24} xl={8}>
          <Card size="small" title="Status by category" style={{ marginBottom: 16 }}>
            {retailer.categories.length === 0 ? <Typography.Text type="secondary">No buyers yet</Typography.Text> : (
              <Space direction="vertical" size={6} style={{ width: "100%" }}>
                {[...retailer.categories].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)).map((c) => (
                  <div key={c.category} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span><strong>{c.category}</strong> <Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.buyerName}</Typography.Text></span>
                    <Tag color={STATUS_COLORS[c.status]} style={{ margin: 0 }}>{c.status}</Tag>
                  </div>
                ))}
              </Space>
            )}
          </Card>
          <BillingAddress key={`${retailer.id}-${retailer.billingAddress}`} retailer={retailer} onSaved={load} />
          <Card size="small" title="Recent activity" style={{ marginTop: 16 }}>
            {history.length === 0 ? <Typography.Text type="secondary">Nothing logged yet</Typography.Text> : (
              <Timeline
                style={{ marginTop: 8 }}
                items={history.map((h) => ({
                  color: ACTION_COLORS[h.actionTaken] || "gray",
                  children: (
                    <div style={{ fontSize: 13 }}>
                      <Space size={4} wrap>
                        <strong>{dayjs(h.date).format("MMM D")}</strong>
                        <Tag color={ACTION_COLORS[h.actionTaken]} style={{ margin: 0 }}>{ACTION_LABELS[h.actionTaken] || h.actionTaken}</Tag>
                        {h.contactId && <a onClick={() => setOpenId(h.contactId)}>{h.contactName}</a>}
                        {h.category && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{h.category}</Typography.Text>}
                      </Space>
                      {h.notes && <div style={{ color: "#555" }}>{h.notes}</div>}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>

      {openId && <ContactDrawer key={openId} contactId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      <ContactFormModal
        open={adding !== null}
        defaults={{ retailerId: retailer.id, categories: adding ? [adding] : [], role: adding === "Other" ? "Accounts Payable" : "Buyer" }}
        onClose={() => setAdding(null)}
        onSaved={() => load()}
      />
    </div>
  );
}

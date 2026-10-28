import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Col, Row, Space, Spin, Statistic, Table, Tag, Typography } from "antd";
import { EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { ACTION_COLORS, ACTION_LABELS, STATUS_COLORS } from "../../constants/crm";
import ContactDrawer from "../../components/crm/ContactDrawer";
import BulkLogModal from "../../components/crm/BulkLogModal";

const STAT_ORDER = ["Active", "Order Placed", "Warm", "No Response", "Not Contacted", "Not Interested"];
const STAT_COLORS = {
  Active: "#52c41a", "Order Placed": "#1677ff", Warm: "#fa8c16", "No Response": "#722ed1", "Not Contacted": "#595959", "Not Interested": "#cf1322",
};

function LastActivity({ a }) {
  if (!a) return <Typography.Text type="secondary">Never</Typography.Text>;
  return (
    <Space size={4}>
      <span>{dayjs(a.date).format("MMM D")}</span>
      <Tag color={ACTION_COLORS[a.actionTaken]} style={{ margin: 0 }}>{ACTION_LABELS[a.actionTaken] || a.actionTaken}</Tag>
    </Space>
  );
}

export default function CrmDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(() => crmApi.dashboard()
    .then((d) => { setData(d); setError(null); })
    .catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  if (error) return <Alert type="error" message={error} showIcon />;
  if (!data) return <Spin />;

  const buyerCols = [
    { title: "Company", dataIndex: "retailerName", render: (v, r) => <Link to={`/crm/accounts/${r.retailerId}`} onClick={(e) => e.stopPropagation()}>{v}</Link> },
    { title: "Buyer", dataIndex: "name", render: (v) => <a>{v}</a> },
    { title: "Categories", dataIndex: "categories", render: (c) => c.join(", ") },
    { title: "Status", dataIndex: "status", render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
  ];
  const rowClick = (r) => ({ onClick: () => setOpenId(r.id), style: { cursor: "pointer" } });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Sales Dashboard</Typography.Title>
        <Space>
          <Button type="primary" icon={<EditOutlined />} onClick={() => setBulkOpen(true)}>Log</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {STAT_ORDER.map((s) => (
          <Col key={s} xs={12} sm={8} lg={4}>
            <Card size="small"><Statistic title={s} value={data.statusCounts[s] || 0} valueStyle={{ color: STAT_COLORS[s] }} /></Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card size="small" title={`Follow-ups due (${data.followUps.length})`}>
            <Table size="small" rowKey="id" dataSource={data.followUps} pagination={{ pageSize: 10, size: "small", hideOnSinglePage: true }}
              onRow={rowClick}
              columns={[
                ...buyerCols,
                {
                  title: "Due", dataIndex: "nextFollowUp",
                  render: (d) => <span style={{ color: d < data.today ? "#cf1322" : "#d46b08", fontWeight: 600 }}>{dayjs(d).format("MMM D")}</span>,
                },
              ]}
              locale={{ emptyText: "Nothing due — nice." }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={`Not touched in 30+ days (${data.notTouched.length})`}>
            <Table size="small" rowKey="id" dataSource={data.notTouched} pagination={{ pageSize: 10, size: "small", hideOnSinglePage: true }}
              onRow={rowClick}
              columns={[...buyerCols, { title: "Last", key: "last", render: (_, r) => <LastActivity a={r.lastActivity} /> }]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={`Top priority accounts (${data.topPriority.length})`}>
            <Table size="small" rowKey="id" dataSource={data.topPriority} pagination={{ pageSize: 10, size: "small", hideOnSinglePage: true }}
              onRow={rowClick}
              columns={[...buyerCols, { title: "Last", key: "last", render: (_, r) => <LastActivity a={r.lastActivity} /> }]}
              locale={{ emptyText: "No warm or active buyers at high-priority retailers yet" }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="Recent activity">
            <Table size="small" rowKey="id" dataSource={data.recentActivity} pagination={{ pageSize: 10, size: "small", hideOnSinglePage: true }}
              onRow={(a) => ({ onClick: () => setOpenId(a.contactId), style: { cursor: "pointer" } })}
              columns={[
                { title: "Date", dataIndex: "date", width: 70, render: (d) => dayjs(d).format("MMM D") },
                { title: "Who", key: "who", render: (_, a) => <><a>{a.contactName}</a><div style={{ fontSize: 12, color: "#888" }}>{a.retailerName}</div></> },
                { title: "Action", dataIndex: "actionTaken", render: (v) => <Tag color={ACTION_COLORS[v]}>{ACTION_LABELS[v] || v}</Tag> },
                { title: "Note", dataIndex: "notes", ellipsis: true },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {openId && <ContactDrawer key={openId} contactId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      <BulkLogModal open={bulkOpen} onClose={() => setBulkOpen(false)} onLogged={load} />
    </>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Row, Col, Card, Statistic, Table, Tag, Spin, Alert, Typography, Badge } from "antd";
import { crmApi } from "../../api/inventory";
import dayjs from "dayjs";

const STATUS_COLORS = {
  "Active": "green",
  "Order Placed": "blue",
  "Warm": "orange",
  "Not Contacted": "default",
  "No Response": "purple",
  "Not Interested": "red",
  "No Contact Found": "default",
};

const STAT_STYLE = {
  "Active": { color: "#52c41a" },
  "Order Placed": { color: "#1677ff" },
  "Warm": { color: "#fa8c16" },
  "Not Contacted": { color: "#595959" },
  "No Response": { color: "#722ed1" },
  "Not Interested": { color: "#cf1322" },
  "No Contact Found": { color: "#8c8c8c" },
};

export default function CrmDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    crmApi.dashboard()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <Alert type="error" message={error} showIcon />;

  const statOrder = ["Active", "Order Placed", "Warm", "Not Contacted", "No Response", "Not Interested", "No Contact Found"];

  return (
    <Spin spinning={loading}>
      <Typography.Title level={4} style={{ margin: "0 0 20px" }}>
        Basic Trading Inc — Sales Dashboard
      </Typography.Title>

      {/* Status counts */}
      <Row gutter={12} style={{ marginBottom: 24 }}>
        {statOrder.map((status) => (
          <Col key={status} flex="1">
            <Card size="small">
              <Statistic
                title={status}
                value={data?.statusCounts?.[status] ?? 0}
                valueStyle={STAT_STYLE[status]}
              />
            </Card>
          </Col>
        ))}
        <Col flex="1">
          <Card size="small">
            <Statistic title="Total Accounts" value={data?.totalAccounts ?? 0} valueStyle={{ fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* Top Priority */}
        <Col span={12}>
          <Card
            title={<span>🔥 Top Priority Accounts</span>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Table
              size="small"
              pagination={false}
              rowKey={(r, i) => i}
              dataSource={data?.topPriority ?? []}
              columns={[
                {
                  title: "Company",
                  dataIndex: "retailer",
                  render: (name, r) => (
                    <Link to={`/crm/accounts?name=${encodeURIComponent(name)}`}>{name}</Link>
                  ),
                },
                { title: "Category", dataIndex: "category" },
                { title: "Buyer", dataIndex: "buyer", render: (v) => v || "—" },
                {
                  title: "Status",
                  dataIndex: "status",
                  render: (v) => <Tag color={STATUS_COLORS[v]}>{v}</Tag>,
                },
              ]}
              locale={{ emptyText: "No high-priority active accounts" }}
            />
          </Card>
        </Col>

        {/* Not touched in 30 days */}
        <Col span={12}>
          <Card
            title={<span>⏰ Not Touched in 30+ Days</span>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Table
              size="small"
              pagination={false}
              rowKey={(r, i) => i}
              dataSource={data?.notTouched ?? []}
              columns={[
                {
                  title: "Company",
                  dataIndex: "retailer",
                  render: (name) => (
                    <Link to={`/crm/accounts?name=${encodeURIComponent(name)}`}>{name}</Link>
                  ),
                },
                { title: "Category", dataIndex: "category" },
                { title: "Buyer", dataIndex: "buyer", render: (v) => v || "—" },
                {
                  title: "Last Logged",
                  dataIndex: "lastLogged",
                  render: (v) => v ? dayjs(v).format("MMM D") : <span style={{ color: "#cf1322" }}>Never logged</span>,
                },
              ]}
              locale={{ emptyText: "All accounts touched recently" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Overdue follow-ups */}
      {data?.overdueActivity?.length > 0 && (
        <Card
          title={<span><Badge status="error" /> Overdue Follow-ups ({data.overdueActivity.length})</span>}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={data.overdueActivity}
            columns={[
              { title: "Company", dataIndex: "retailerName", render: (n) => <Link to={`/crm/accounts?name=${encodeURIComponent(n)}`}>{n}</Link> },
              { title: "Category", dataIndex: "category", render: (v) => v || "—" },
              { title: "Next Step", dataIndex: "nextStep", render: (v) => v || "—" },
              {
                title: "Due",
                dataIndex: "nextStepDate",
                render: (v) => <span style={{ color: "#cf1322" }}>{dayjs(v).format("MMM D, YYYY")}</span>,
              },
              { title: "Rep", dataIndex: "rep", render: (v) => v || "—" },
            ]}
          />
        </Card>
      )}

      {/* Recently sent */}
      <Card title="📬 Recently Sent — Linesheets, Samples & Follow-ups" size="small">
        <Table
          size="small"
          pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
          rowKey="id"
          dataSource={data?.recentSent ?? []}
          columns={[
            { title: "Date", dataIndex: "dateSent", render: (v) => dayjs(v).format("MMM D, YYYY") },
            { title: "Company", dataIndex: "retailerName", render: (n) => <Link to={`/crm/accounts?name=${encodeURIComponent(n)}`}>{n}</Link> },
            { title: "Category", dataIndex: "category", render: (v) => v || "—" },
            { title: "Buyer", dataIndex: "buyerName", render: (v) => v || "—" },
            { title: "Sent Item", dataIndex: "itemSent" },
            { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
            {
              title: "Response",
              dataIndex: "responseReceived",
              render: (v) => v ? (
                <Tag color={v === "Interested" ? "green" : v === "Not Interested" ? "red" : "default"}>{v}</Tag>
              ) : "—",
            },
            { title: "Follow-up", dataIndex: "followUpDate", render: (v) => v ? dayjs(v).format("MMM D") : "—" },
          ]}
          locale={{ emptyText: "Nothing sent yet" }}
        />
      </Card>
    </Spin>
  );
}

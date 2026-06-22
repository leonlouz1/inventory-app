import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Table, Tag, Spin, Alert, Typography } from "antd";
import { productsApi, ordersApi, alertsApi } from "../api/inventory";

const FLAG_META = {
  warehouse_shortage: { label: "⚠ Warehouse shortage", color: "red" },
  network_shortage: { label: "⚠ Network shortage", color: "volcano" },
  low_stock: { label: "△ Low on ship date", color: "gold" },
};

const COLUMNS = [
  { title: "Order #", dataIndex: "orderNumber", key: "orderNumber" },
  { title: "Customer", dataIndex: "customer", key: "customer" },
  { title: "SKU", dataIndex: "sku", key: "sku" },
  { title: "Ship From", dataIndex: "shipFrom", key: "shipFrom", render: (v) => v || "Unassigned" },
  { title: "Ship Date", dataIndex: "shipDate", key: "shipDate" },
  { title: "Projected Available", dataIndex: "projectedAvailable", key: "projectedAvailable" },
  {
    title: "Flag",
    dataIndex: "flags",
    key: "flags",
    render: (flags) => (
      <>
        {flags.map((flag) => (
          <Tag color={FLAG_META[flag]?.color} key={flag}>
            {FLAG_META[flag]?.label ?? flag}
          </Tag>
        ))}
      </>
    ),
  },
];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([productsApi.list(), ordersApi.list(), alertsApi.list()])
      .then(([productsRes, ordersRes, alertsRes]) => {
        if (cancelled) return;
        setProducts(productsRes);
        setOrders(ordersRes);
        setAlerts(alertsRes);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Alert type="error" message="Failed to load dashboard" description={error} showIcon />;
  }

  const totalSkus = products.length;
  const totalOnHand = products.reduce((sum, p) => sum + p.totalOnHand, 0);
  const openOrders = orders.length;
  const activeAlerts = alerts.length;

  return (
    <Spin spinning={loading}>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="Total SKUs" value={totalSkus} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Total Units On Hand" value={totalOnHand} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="Open Orders" value={openOrders} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Active Alerts"
              value={activeAlerts}
              valueStyle={activeAlerts > 0 ? { color: "#cf1322" } : undefined}
            />
          </Card>
        </Col>
      </Row>

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        Alerts
      </Typography.Title>
      <Table
        columns={COLUMNS}
        dataSource={alerts}
        rowKey="orderLineId"
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: "No active alerts" }}
      />
    </Spin>
  );
}

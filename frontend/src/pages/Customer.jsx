import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Select, Spin, Alert, Typography, Empty, Table, Tag, Row, Col, Statistic, Card } from "antd";
import dayjs from "dayjs";
import { ordersApi } from "../api/inventory";

const today = dayjs().startOf("day");

function flattenLines(orders) {
  return orders.flatMap((order) =>
    order.lines.map((line) => ({
      key: line.id,
      orderNumber: order.orderNumber,
      customerPo: order.customerPo,
      orderStatus: order.status,
      ...line,
    }))
  );
}

const LINE_COLUMNS = (showStatus) => [
  { title: "Order #", dataIndex: "orderNumber" },
  { title: "Customer PO #", dataIndex: "customerPo", render: (v) => v || "—" },
  { title: "SKU", dataIndex: "sku" },
  { title: "Product", dataIndex: "productName" },
  { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
  { title: "Qty", dataIndex: "quantity", align: "right" },
  {
    title: "Ship Date",
    dataIndex: "shipDate",
    render: (v, line) => {
      const overdue = showStatus && dayjs(v).isBefore(today) && line.orderStatus !== "SHIPPED";
      return overdue ? (
        <span>
          {v} <Tag color="red">Overdue</Tag>
        </span>
      ) : (
        v
      );
    },
  },
  ...(showStatus
    ? [
        {
          title: "Order Status",
          dataIndex: "orderStatus",
          render: (v) => <Tag color={v === "ROUTED" ? "purple" : "blue"}>{v}</Tag>,
        },
      ]
    : []),
];

export default function Customer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const customer = searchParams.get("name");

  useEffect(() => {
    setLoading(true);
    ordersApi
      .list()
      .then((data) => {
        setOrders(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const customerOptions = useMemo(() => {
    const names = [...new Set(orders.map((o) => o.customer))].sort();
    return names.map((name) => ({ value: name, label: name }));
  }, [orders]);

  function setCustomer(name) {
    setSearchParams(name ? { name } : {});
  }

  const customerOrders = useMemo(
    () => orders.filter((o) => o.customer === customer),
    [orders, customer]
  );

  const allLines = useMemo(() => flattenLines(customerOrders), [customerOrders]);
  const pastLines = useMemo(
    () => allLines.filter((l) => l.orderStatus === "SHIPPED").sort((a, b) => b.shipDate.localeCompare(a.shipDate)),
    [allLines]
  );
  const upcomingLines = useMemo(
    () =>
      allLines
        .filter((l) => l.orderStatus === "CONFIRMED" || l.orderStatus === "ROUTED")
        .sort((a, b) => a.shipDate.localeCompare(b.shipDate)),
    [allLines]
  );
  const draftCount = useMemo(() => allLines.filter((l) => l.orderStatus === "DRAFT").length, [allLines]);

  const totalPastUnits = pastLines.reduce((sum, l) => sum + l.quantity, 0);
  const totalUpcomingUnits = upcomingLines.reduce((sum, l) => sum + l.quantity, 0);
  const distinctSkus = new Set(allLines.map((l) => l.sku)).size;

  if (error) {
    return <Alert type="error" message="Failed to load orders" description={error} showIcon />;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 24 }}>
        <Select
          showSearch
          placeholder="Select customer"
          style={{ width: 320 }}
          options={customerOptions}
          value={customer || undefined}
          filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          onChange={setCustomer}
        />
      </div>

      <Spin spinning={loading}>
        {customer ? (
          <>
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card>
                  <Statistic title="Units Purchased (Shipped)" value={totalPastUnits} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="Units on Upcoming Orders" value={totalUpcomingUnits} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="Distinct SKUs" value={distinctSkus} />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic title="Total Orders" value={customerOrders.length} />
                </Card>
              </Col>
            </Row>

            <Typography.Title level={5}>Upcoming Orders (Confirmed / Routed)</Typography.Title>
            <Table
              columns={LINE_COLUMNS(true)}
              dataSource={upcomingLines}
              rowKey="key"
              pagination={{ pageSize: 10 }}
              size="small"
              style={{ marginBottom: 32 }}
              locale={{ emptyText: "No upcoming orders" }}
            />

            <Typography.Title level={5}>Past Purchases (Shipped)</Typography.Title>
            <Table
              columns={LINE_COLUMNS(false)}
              dataSource={pastLines}
              rowKey="key"
              pagination={{ pageSize: 10 }}
              size="small"
              locale={{ emptyText: "No shipped orders yet" }}
            />

            {draftCount > 0 && (
              <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                Plus {draftCount} line{draftCount === 1 ? "" : "s"} on draft order(s), not shown above since they
                aren't committed yet.
              </Typography.Paragraph>
            )}
          </>
        ) : (
          !loading && <Empty description="Select a customer to view their order history" />
        )}
      </Spin>
    </div>
  );
}

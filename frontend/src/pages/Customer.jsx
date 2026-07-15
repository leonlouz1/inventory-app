import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Select, Spin, Alert, Typography, Empty, Table, Tag, Row, Col, Statistic, Card, Button, Space } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { ordersApi, crmApi } from "../api/inventory";

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
  { title: "Order #", dataIndex: "orderNumber", sorter: (a, b) => a.orderNumber.localeCompare(b.orderNumber) },
  { title: "Customer PO #", dataIndex: "customerPo", render: (v) => v || "—" },
  { title: "SKU", dataIndex: "sku", sorter: (a, b) => a.sku.localeCompare(b.sku) },
  { title: "Product", dataIndex: "productName", sorter: (a, b) => a.productName.localeCompare(b.productName) },
  { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned", sorter: (a, b) => (a.warehouseName || "").localeCompare(b.warehouseName || "") },
  { title: "Qty", dataIndex: "quantity", align: "right", sorter: (a, b) => a.quantity - b.quantity },
  {
    title: "Ship Date",
    dataIndex: "shipDate",
    sorter: (a, b) => a.shipDate.localeCompare(b.shipDate),
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

function downloadUpcomingReport(customer, lines) {
  const rows = lines.map((l) => ({
    "Order #": l.orderNumber,
    "Customer PO #": l.customerPo || "",
    SKU: l.sku,
    Product: l.productName,
    Warehouse: l.warehouseName || "Unassigned",
    Qty: l.quantity,
    "Ship Date": l.shipDate,
    "Order Status": l.orderStatus,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [14, 16, 12, 40, 24, 8, 14, 14].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Upcoming Orders");
  XLSX.writeFile(wb, `${customer}-upcoming-orders.xlsx`);
}

export default function Customer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [activeRetailers, setActiveRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [warehouseFilter, setWarehouseFilter] = useState(null);
  const customer = searchParams.get("name");

  useEffect(() => {
    setLoading(true);
    Promise.all([ordersApi.list(), crmApi.activeCustomers()])
      .then(([orderData, retailers]) => {
        setOrders(orderData);
        setActiveRetailers(retailers);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Show active CRM retailers in the dropdown.
  // Also include any customer that already has orders but isn't in CRM yet
  // (so existing data doesn't vanish).
  const customerOptions = useMemo(() => {
    const activeNames = new Set(activeRetailers.map((r) => r.name));
    const orderNames = new Set(orders.map((o) => o.customer));
    // union: active CRM retailers + any order customer not in CRM
    const all = new Set([...activeNames, ...[...orderNames].filter((n) => !activeNames.size || orderNames.has(n) && activeNames.has(n))]);
    // Only show: active CRM retailers (regardless of orders) + existing order customers that are active
    const names = [...activeNames].sort();
    return names.map((name) => ({ value: name, label: name }));
  }, [activeRetailers, orders]);

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

  const warehouseOptions = useMemo(() => {
    const names = [...new Set(upcomingLines.map((l) => l.warehouseName || "Unassigned"))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [upcomingLines]);

  const filteredUpcomingLines = useMemo(
    () => warehouseFilter ? upcomingLines.filter((l) => (l.warehouseName || "Unassigned") === warehouseFilter) : upcomingLines,
    [upcomingLines, warehouseFilter]
  );

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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Typography.Title level={5} style={{ margin: 0 }}>Upcoming Orders (Confirmed / Routed)</Typography.Title>
              <Space>
                <Select
                  allowClear
                  placeholder="Filter by warehouse"
                  style={{ width: 200 }}
                  options={warehouseOptions}
                  value={warehouseFilter}
                  onChange={setWarehouseFilter}
                />
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => downloadUpcomingReport(customer, filteredUpcomingLines)}
                  disabled={filteredUpcomingLines.length === 0}
                >
                  Download Report
                </Button>
              </Space>
            </div>
            <Table
              columns={LINE_COLUMNS(true)}
              dataSource={filteredUpcomingLines}
              rowKey="key"
              pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
              size="small"
              style={{ marginBottom: 32 }}
              locale={{ emptyText: "No upcoming orders" }}
            />

            <Typography.Title level={5}>Past Purchases (Shipped)</Typography.Title>
            <Table
              columns={LINE_COLUMNS(false)}
              dataSource={pastLines}
              rowKey="key"
              pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
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

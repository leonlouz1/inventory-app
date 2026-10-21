import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { Alert, Card, Col, Empty, Row, Segmented, Spin, Statistic, Tag, Typography } from "antd";
import { InboxOutlined, ShoppingCartOutlined, TruckOutlined, WarningOutlined } from "@ant-design/icons";
import { containersApi, ordersApi, shipmentsApi } from "../api/inventory";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "../constants/orderStatuses";
import { CONTAINER_STATUS_COLORS, CONTAINER_STATUS_LABELS } from "../constants/containers";
import CancelDateTag from "../components/CancelDateTag";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
];

// [start, end] as YYYY-MM-DD strings, inclusive. Weeks run Monday–Sunday.
function rangeFor(value) {
  const today = dayjs().startOf("day");
  if (value === "today") return [today, today];
  if (value === "week") {
    const monday = today.subtract((today.day() + 6) % 7, "day");
    return [monday, monday.add(6, "day")];
  }
  return [today, today.add(Number(value) - 1, "day")];
}

const fmt = (d) => d.format("YYYY-MM-DD");

// Everything happening in the chosen period, plus anything overdue:
// containers arriving, orders shipping and shipments picking up.
export default function Upcoming() {
  const [range, setRange] = useState("week");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([containersApi.list(), ordersApi.list(), shipmentsApi.list()])
      .then(([containers, orders, shipments]) => setData({ containers, orders, shipments }))
      .catch((err) => setError(err.message));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const [startDay, endDay] = rangeFor(range);
    const start = fmt(startDay);
    const end = fmt(endDay);
    const today = fmt(dayjs());
    const inRange = (d) => d >= start && d <= end;

    // Containers not yet received, by ETA
    const containers = data.containers
      .filter((c) => c.status !== "RECEIVED" && c.status !== "DRAFT")
      .map((c) => ({ kind: "container", date: c.eta, item: c }));

    // Orders not shipped/cancelled: one entry per ship date on the order
    const orders = data.orders
      .filter((o) => !["SHIPPED", "CANCELLED", "DRAFT"].includes(o.status))
      .flatMap((o) => {
        const byDate = new Map();
        for (const l of o.lines) {
          if (!byDate.has(l.shipDate)) byDate.set(l.shipDate, []);
          byDate.get(l.shipDate).push(l);
        }
        return [...byDate.entries()].map(([date, lines]) => ({ kind: "order", date, item: o, lines }));
      });

    // Shipments still scheduled, by pickup date
    const shipments = data.shipments
      .filter((s) => s.status === "SCHEDULED")
      .map((s) => ({ kind: "shipment", date: s.pickupDate.slice(0, 10), item: s }));

    const all = [...containers, ...orders, ...shipments];
    const overdue = all.filter((e) => e.date < today).sort((a, b) => a.date.localeCompare(b.date));
    // Earlier days that still aren't done show under Overdue instead
    const upcoming = all.filter((e) => inRange(e.date) && e.date >= today);
    const days = new Map();
    for (const e of upcoming.sort((a, b) => a.date.localeCompare(b.date))) {
      if (!days.has(e.date)) days.set(e.date, []);
      days.get(e.date).push(e);
    }

    const units = (e) => (e.kind === "order" ? e.lines.reduce((s, l) => s + l.quantity, 0) : 0);
    return {
      start: startDay,
      end: endDay,
      overdue,
      days: [...days.entries()],
      counts: {
        containers: upcoming.filter((e) => e.kind === "container").length,
        unitsArriving: upcoming.filter((e) => e.kind === "container").reduce((s, e) => s + e.item.orderedUnits, 0),
        orders: new Set(upcoming.filter((e) => e.kind === "order").map((e) => e.item.id)).size,
        unitsShipping: upcoming.reduce((s, e) => s + units(e), 0),
        pickups: upcoming.filter((e) => e.kind === "shipment").length,
      },
    };
  }, [data, range]);

  if (error) return <Alert type="error" message="Couldn't load what's coming up" description={error} showIcon />;
  if (!view) return <Spin />;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>Upcoming</Typography.Title>
          <Typography.Text type="secondary">
            {view.start.isSame(view.end, "day") ? view.start.format("dddd, MMM D") : `${view.start.format("MMM D")} – ${view.end.format("MMM D, YYYY")}`}
          </Typography.Text>
        </div>
        <Segmented value={range} onChange={setRange} options={RANGES} />
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Containers arriving" value={view.counts.containers} prefix={<InboxOutlined />} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Units arriving" value={view.counts.unitsArriving} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Orders shipping" value={view.counts.orders} prefix={<ShoppingCartOutlined />} suffix={<span style={{ fontSize: 13, color: "#8c8c8c" }}>{view.counts.unitsShipping} units</span>} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Pickups" value={view.counts.pickups} prefix={<TruckOutlined />} /></Card>
        </Col>
      </Row>

      {view.overdue.length > 0 && (
        <Card
          size="small"
          title={<span style={{ color: "#cf1322" }}><WarningOutlined /> Overdue ({view.overdue.length})</span>}
          style={{ marginBottom: 16, borderColor: "#ffccc7" }}
        >
          {view.overdue.map((e) => <EventRow key={`${e.kind}-${e.item.id}-${e.date}`} event={e} showDate />)}
        </Card>
      )}

      {view.days.length === 0 ? (
        <Card><Empty description="Nothing scheduled in this period" /></Card>
      ) : (
        view.days.map(([date, events]) => (
          <Card
            key={date}
            size="small"
            title={dayjs(date).format("dddd, MMM D")}
            extra={date === fmt(dayjs()) ? <Tag color="blue">Today</Tag> : null}
            style={{ marginBottom: 12 }}
          >
            {events.map((e) => <EventRow key={`${e.kind}-${e.item.id}-${date}`} event={e} />)}
          </Card>
        ))
      )}
    </>
  );
}

function EventRow({ event, showDate }) {
  const { kind, item } = event;
  const rowStyle = { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f5f5f5", flexWrap: "wrap" };
  const date = showDate ? <span style={{ color: "#cf1322", minWidth: 84 }}>{dayjs(event.date).format("MMM D")}</span> : null;

  if (kind === "container") {
    return (
      <div style={rowStyle}>
        {date}
        <Tag icon={<InboxOutlined />} color="purple">Container</Tag>
        <Link to={`/restocks/${item.id}`}><strong>{item.containerNumber || "No # yet"}</strong></Link>
        <span>{item.supplier || ""}{item.poNumber ? ` · PO ${item.poNumber}` : ""}</span>
        <span style={{ color: "#8c8c8c" }}>→ {item.warehouseName} · {item.skuCount} SKU{item.skuCount === 1 ? "" : "s"} · {item.orderedUnits} units</span>
        <Tag color={CONTAINER_STATUS_COLORS[item.status]} style={{ marginLeft: "auto" }}>{CONTAINER_STATUS_LABELS[item.status]}</Tag>
      </div>
    );
  }
  if (kind === "order") {
    const units = event.lines.reduce((s, l) => s + l.quantity, 0);
    return (
      <div style={rowStyle}>
        {date}
        <Tag icon={<ShoppingCartOutlined />} color="blue">Order</Tag>
        <Link to={`/orders/${item.id}`}><strong>{item.orderNumber}</strong></Link>
        <Link to={`/customers?name=${encodeURIComponent(item.customer)}`}>{item.customer}</Link>
        {item.customerPo && <span style={{ color: "#8c8c8c" }}>PO {item.customerPo}</span>}
        <span style={{ color: "#8c8c8c" }}>· {event.lines.length} line{event.lines.length === 1 ? "" : "s"} · {units} units</span>
        {item.cancelDate && <span style={{ color: "#8c8c8c" }}>· cancel <CancelDateTag order={item} /></span>}
        <Tag color={ORDER_STATUS_COLORS[item.status]} style={{ marginLeft: "auto" }}>{ORDER_STATUS_LABELS[item.status]}</Tag>
      </div>
    );
  }
  return (
    <div style={rowStyle}>
      {date}
      <Tag icon={<TruckOutlined />} color="green">Pickup</Tag>
      <Link to={`/shipments/${item.id}`}><strong>{item.shipmentNumber}</strong></Link>
      <span>{dayjs(item.pickupDate).format("h:mm A")}{item.carrier ? ` · ${item.carrier}` : ""}</span>
      <span style={{ color: "#8c8c8c" }}>
        {item.warehouseName ? `from ${item.warehouseName} · ` : ""}{item.orders.length} order{item.orders.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

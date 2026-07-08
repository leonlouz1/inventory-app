import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Select, Segmented, Spin, Alert, Typography, Empty, Modal, Table, Tag } from "antd";
import dayjs from "dayjs";
import { productsApi, timelineApi } from "../api/inventory";

const FLAG_BG = {
  ok: undefined,
  low: "#ffe7ba",
  shortage: "#ffccc7",
};

const RESTOCK_BG = "#d9f7be";
const ORDER_BG = "#bae7ff";

function formatPeriodLabel(period, grain) {
  return grain === "week" ? dayjs(period.start).format("MMM D") : dayjs(period.start).format("MMM YYYY");
}

function TimelineBlock({ title, rows, periods, grain, flags, onShowDetail }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <Typography.Title level={5}>{title}</Typography.Title>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: periods.length * 70 + 160 }}>
          <thead>
            <tr>
              <th style={cellStyle(true)}></th>
              {periods.map((p, i) => (
                <th key={i} style={cellStyle(true)}>
                  {formatPeriodLabel(p, grain)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={cellStyle(true)}>On Hand (period start)</td>
              {rows.onHandStart.map((v, i) => (
                <td key={i} style={cellStyle()}>
                  {v}
                </td>
              ))}
            </tr>
            <tr>
              <td style={cellStyle(true)}>+ Restocks Arriving</td>
              {rows.restocksIn.map((v, i) => (
                <td
                  key={i}
                  style={cellStyle(false, v > 0 ? RESTOCK_BG : undefined, v > 0)}
                  onClick={() => v > 0 && onShowDetail("restocks", formatPeriodLabel(periods[i], grain), rows.restocksDetail[i])}
                >
                  {v}
                </td>
              ))}
            </tr>
            <tr>
              <td style={cellStyle(true)}>&minus; Orders Shipping</td>
              {rows.ordersOut.map((v, i) => (
                <td
                  key={i}
                  style={cellStyle(false, v > 0 ? ORDER_BG : undefined, v > 0)}
                  onClick={() => v > 0 && onShowDetail("orders", formatPeriodLabel(periods[i], grain), rows.ordersDetail[i])}
                >
                  {v}
                </td>
              ))}
            </tr>
            <tr>
              <td style={cellStyle(true)}>Projected Available</td>
              {rows.projectedAvailable.map((v, i) => (
                <td key={i} style={cellStyle(false, FLAG_BG[flags[i]])}>
                  <strong>{v}</strong>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ORDER_DETAIL_COLUMNS = [
  {
    title: "Order #",
    dataIndex: "orderNumber",
    render: (v) => <Link to="/orders">{v}</Link>,
  },
  { title: "Customer", dataIndex: "customer" },
  { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
  { title: "Qty", dataIndex: "quantity", align: "right" },
  { title: "Ship Date", dataIndex: "shipDate" },
];

const RESTOCK_DETAIL_COLUMNS = [
  { title: "Warehouse", dataIndex: "warehouseName" },
  { title: "Qty", dataIndex: "quantity", align: "right" },
  { title: "Expected Date", dataIndex: "expectedDate" },
  { title: "Supplier", dataIndex: "supplier", render: (v) => v || "—" },
];

function DetailModal({ detail, onClose }) {
  if (!detail) return null;
  const { kind, periodLabel, items } = detail;
  const isOrders = kind === "orders";
  return (
    <Modal
      title={`${isOrders ? "Orders Shipping" : "Restocks Arriving"} — ${periodLabel}`}
      open
      onCancel={onClose}
      footer={null}
      width={700}
    >
      <Table
        columns={isOrders ? ORDER_DETAIL_COLUMNS : RESTOCK_DETAIL_COLUMNS}
        dataSource={items}
        rowKey={isOrders ? "orderId" : "restockId"}
        pagination={false}
        size="small"
      />
    </Modal>
  );
}

function cellStyle(isLabel = false, bg, clickable = false) {
  return {
    border: "1px solid #f0f0f0",
    padding: "6px 10px",
    textAlign: isLabel ? "left" : "center",
    fontWeight: isLabel ? 500 : 400,
    background: bg,
    whiteSpace: "nowrap",
    cursor: clickable ? "pointer" : undefined,
    textDecoration: clickable ? "underline" : undefined,
  };
}

export default function Timeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [sku, setSkuState] = useState(searchParams.get("sku"));
  const [grain, setGrain] = useState("week");
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  function showDetail(kind, periodLabel, items) {
    setDetail({ kind, periodLabel, items });
  }

  function setSku(newSku) {
    setSkuState(newSku);
    setSearchParams(newSku ? { sku: newSku } : {});
  }

  useEffect(() => {
    productsApi.list().then((data) => {
      setProducts(data);
      if (!sku && data.length > 0) setSku(data[0].sku);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep state in sync if the URL's sku param changes externally (e.g. a link
  // from the Products page navigating here while already on /timeline).
  useEffect(() => {
    const urlSku = searchParams.get("sku");
    if (urlSku && urlSku !== sku) setSkuState(urlSku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!sku) return;
    setLoading(true);
    timelineApi
      .get(sku, grain)
      .then((data) => {
        setTimeline(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sku, grain]);

  useEffect(() => {
    if (!sku) return;
    setHistoryLoading(true);
    timelineApi
      .history(sku)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [sku]);

  const skuOptions = useMemo(
    () => products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products]
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 24 }}>
        <Select
          showSearch
          placeholder="Select SKU"
          style={{ width: 320 }}
          options={skuOptions}
          value={sku}
          filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          onChange={setSku}
        />
        <Segmented
          options={[
            { label: "Week (16 weeks)", value: "week" },
            { label: "Month (12 months)", value: "month" },
          ]}
          value={grain}
          onChange={setGrain}
        />
      </div>

      {error && <Alert type="error" message="Failed to load timeline" description={error} showIcon />}

      <Spin spinning={loading}>
        {timeline ? (
          <>
            <Typography.Paragraph type="secondary">
              Reorder point: <strong>{timeline.reorderPoint}</strong> units (network-wide)
            </Typography.Paragraph>
            <TimelineBlock
              title="Network Total (All Warehouses)"
              rows={timeline.network}
              periods={timeline.periods}
              grain={timeline.grain}
              flags={timeline.network.flags}
              onShowDetail={showDetail}
            />
            {timeline.warehouses.map((w) => (
              <TimelineBlock
                key={w.warehouseId}
                title={w.warehouseName}
                rows={w}
                periods={timeline.periods}
                grain={timeline.grain}
                flags={w.flags}
                onShowDetail={showDetail}
              />
            ))}
          </>
        ) : (
          !loading && <Empty description="Select a SKU to view its projection" />
        )}
      </Spin>

      <DetailModal detail={detail} onClose={() => setDetail(null)} />

      {sku && (
        <div style={{ marginTop: 40 }}>
          <Typography.Title level={5}>Stock History</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Past restocks received and orders shipped for this SKU.
          </Typography.Paragraph>
          <Spin spinning={historyLoading}>
            {history.length > 0 ? (
              <Table
                size="small"
                pagination={{ pageSize: 20 }}
                rowKey="id"
                dataSource={history}
                columns={[
                  { title: "Date", dataIndex: "date", width: 110 },
                  {
                    title: "Type",
                    dataIndex: "type",
                    width: 90,
                    render: (t) => <Tag color={t === "IN" ? "green" : "blue"}>{t === "IN" ? "▲ IN" : "▼ OUT"}</Tag>,
                  },
                  { title: "Qty", dataIndex: "qty", width: 80, align: "right" },
                  { title: "Warehouse", dataIndex: "warehouse" },
                  { title: "Source", dataIndex: "source", width: 120 },
                  {
                    title: "Detail",
                    dataIndex: "detail",
                    render: (v, row) => {
                      if (row.type === "OUT" && row.orderId) {
                        return <Link to={`/orders?highlight=${row.orderId}`}>{v}</Link>;
                      }
                      if (row.type === "IN" && row.linkedOrderNumber) {
                        return (
                          <>
                            {v && <span>{v} · </span>}
                            <Link to={`/orders?highlight=${row.linkedOrderId}`}>For {row.linkedOrderNumber}</Link>
                          </>
                        );
                      }
                      return v || "—";
                    },
                  },
                ]}
              />
            ) : (
              !historyLoading && <Empty description="No history yet — restocks and shipped orders will appear here" />
            )}
          </Spin>
        </div>
      )}
    </div>
  );
}

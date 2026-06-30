import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Badge, Spin, Alert, Typography, Modal, List, Tag, Empty, Collapse } from "antd";
import dayjs from "dayjs";
import { ordersApi, restocksApi } from "../api/inventory";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "../constants/orderStatuses";

// Builds a map of "YYYY-MM-DD" -> { shipments: [...], restocks: [...] }.
// Shipments are individual order lines (not whole orders) since a single
// order can ship across several dates; cancelled lines are excluded since
// they will never actually ship.
function buildDayMap(orders, restocks) {
  const map = new Map();
  function get(dateKey) {
    if (!map.has(dateKey)) map.set(dateKey, { shipments: [], restocks: [] });
    return map.get(dateKey);
  }

  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    for (const line of order.lines) {
      get(line.shipDate).shipments.push({ order, line });
    }
  }

  for (const restock of restocks) {
    get(restock.expectedDate).restocks.push(restock);
  }

  return map;
}

export default function CalendarView() {
  const [orders, setOrders] = useState([]);
  const [restocks, setRestocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([ordersApi.list(), restocksApi.list()])
      .then(([ordersRes, restocksRes]) => {
        setOrders(ordersRes);
        setRestocks(restocksRes);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const dayMap = useMemo(() => buildDayMap(orders, restocks), [orders, restocks]);

  function cellRender(date, info) {
    if (info.type !== "date") return info.originNode;
    const key = date.format("YYYY-MM-DD");
    const day = dayMap.get(key);
    if (!day || (day.shipments.length === 0 && day.restocks.length === 0)) return null;

    return (
      <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12 }}>
        {day.shipments.length > 0 && (
          <li>
            <Badge status="processing" color="#fa8c16" text={`${day.shipments.length} shipping`} />
          </li>
        )}
        {day.restocks.length > 0 && (
          <li>
            <Badge status="processing" color="#1677ff" text={`${day.restocks.length} restocking`} />
          </li>
        )}
      </ul>
    );
  }

  const selectedKey = selectedDate ? selectedDate.format("YYYY-MM-DD") : null;
  const selectedDay = selectedKey ? dayMap.get(selectedKey) : null;

  if (error) {
    return <Alert type="error" message="Failed to load calendar" description={error} showIcon />;
  }

  return (
    <Spin spinning={loading}>
      <Typography.Title level={5} style={{ marginBottom: 16 }}>
        Calendar
      </Typography.Title>

      <Calendar cellRender={cellRender} onSelect={setSelectedDate} />

      <Modal
        title={selectedDate ? `${selectedDate.format("MMMM D, YYYY")}` : ""}
        open={!!selectedDate}
        onCancel={() => setSelectedDate(null)}
        footer={null}
        width={640}
      >
        {selectedDay && selectedDay.shipments.length > 0 && (
          <>
            <Typography.Title level={5}>Shipping ({selectedDay.shipments.length})</Typography.Title>
            <List
              size="small"
              dataSource={selectedDay.shipments}
              renderItem={({ order, line }) => (
                <List.Item>
                  <Link to={`/orders?highlight=${order.id}`} onClick={() => setSelectedDate(null)}>
                    {order.orderNumber}
                  </Link>
                  {" — "}
                  <Link to={`/timeline?sku=${encodeURIComponent(line.sku)}`} onClick={() => setSelectedDate(null)}>
                    {line.sku}
                  </Link>
                  {` x${line.quantity} — ${order.customer} `}
                  <Tag color={ORDER_STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Tag>
                </List.Item>
              )}
            />
          </>
        )}

        {selectedDay && selectedDay.restocks.length > 0 && (
          <>
            <Typography.Title level={5} style={{ marginTop: 16 }}>
              Restocking ({selectedDay.restocks.length})
            </Typography.Title>
            {(() => {
              // Group by shipmentId; single restocks get a unique key
              const groups = [];
              const seen = new Map();
              for (const r of selectedDay.restocks) {
                const key = r.shipmentId || `single-${r.id}`;
                if (!seen.has(key)) {
                  seen.set(key, { key, shipmentId: r.shipmentId, warehouseName: r.warehouseName, supplier: r.supplier, lines: [] });
                  groups.push(seen.get(key));
                }
                seen.get(key).lines.push(r);
              }

              const singleItems = groups.filter((g) => g.lines.length === 1);
              const multiGroups = groups.filter((g) => g.lines.length > 1);

              return (
                <>
                  {singleItems.length > 0 && (
                    <List
                      size="small"
                      dataSource={singleItems}
                      renderItem={(g) => {
                        const r = g.lines[0];
                        return (
                          <List.Item>
                            <Link to={`/timeline?sku=${encodeURIComponent(r.sku)}`} onClick={() => setSelectedDate(null)}>
                              {r.sku}
                            </Link>
                            {` x${r.quantity} — ${r.warehouseName}`}
                            {r.supplier && ` (${r.supplier})`}
                          </List.Item>
                        );
                      }}
                    />
                  )}
                  {multiGroups.length > 0 && (
                    <Collapse
                      size="small"
                      style={{ marginTop: singleItems.length > 0 ? 8 : 0 }}
                      items={multiGroups.map((g) => ({
                        key: g.key,
                        label: `${g.lines.length} SKUs — ${g.warehouseName}${g.supplier ? ` (${g.supplier})` : ""}`,
                        children: (
                          <List
                            size="small"
                            dataSource={g.lines}
                            renderItem={(r) => (
                              <List.Item>
                                <Link to={`/timeline?sku=${encodeURIComponent(r.sku)}`} onClick={() => setSelectedDate(null)}>
                                  {r.sku}
                                </Link>
                                {` x${r.quantity}`}
                              </List.Item>
                            )}
                          />
                        ),
                      }))}
                    />
                  )}
                </>
              );
            })()}
          </>
        )}

        {(!selectedDay || (selectedDay.shipments.length === 0 && selectedDay.restocks.length === 0)) && (
          <Empty description="Nothing scheduled" />
        )}
      </Modal>
    </Spin>
  );
}

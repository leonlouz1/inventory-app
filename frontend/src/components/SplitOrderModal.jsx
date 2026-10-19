import { useState } from "react";
import { Modal, Table, InputNumber, DatePicker, Typography, Button, message } from "antd";
import { ordersApi } from "../api/inventory";

// Move part of an order into a new order (e.g. ship what's in stock now and
// the rest later). Each line can move all, some, or none of its quantity.
// Render with key={order?.id} so the form resets for each order.
export default function SplitOrderModal({ order, onClose, onSplit }) {
  const [moveQty, setMoveQty] = useState({});
  const [shipDate, setShipDate] = useState(null);
  const [saving, setSaving] = useState(false);

  const lines = order?.lines || [];
  const movedUnits = lines.reduce((sum, l) => sum + (moveQty[l.id] || 0), 0);
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);
  const canSplit = movedUnits > 0 && movedUnits < totalUnits;

  async function handleOk() {
    setSaving(true);
    try {
      const payload = lines
        .filter((l) => moveQty[l.id] > 0)
        .map((l) => ({ lineId: l.id, quantity: moveQty[l.id] }));
      const created = await ordersApi.split(order.id, payload, shipDate ? shipDate.format("YYYY-MM-DD") : undefined);
      message.success(`Created ${created.orderNumber}`);
      onSplit();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Split ${order?.orderNumber ?? ""}`}
      open={!!order}
      onCancel={onClose}
      onOk={handleOk}
      okText="Create new order"
      okButtonProps={{ disabled: !canSplit }}
      confirmLoading={saving}
      width={680}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Enter how many units of each line move to a new order (same customer and PO, not on any shipment).
        The rest stays on {order?.orderNumber}.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={lines}
        columns={[
          { title: "SKU", dataIndex: "sku", width: 110 },
          { title: "Product", dataIndex: "productName" },
          { title: "Qty", dataIndex: "quantity", align: "right", width: 70 },
          {
            title: "Move to new order",
            key: "move",
            width: 170,
            render: (_, l) => (
              <span style={{ display: "flex", gap: 4 }}>
                <InputNumber
                  min={0}
                  max={l.quantity}
                  precision={0}
                  value={moveQty[l.id] || 0}
                  onChange={(v) => setMoveQty((prev) => ({ ...prev, [l.id]: v || 0 }))}
                  style={{ width: 90 }}
                />
                <Button size="small" type="link" onClick={() => setMoveQty((prev) => ({ ...prev, [l.id]: l.quantity }))}>
                  All
                </Button>
              </span>
            ),
          },
          { title: "Stays", key: "stays", align: "right", width: 70, render: (_, l) => l.quantity - (moveQty[l.id] || 0) },
        ]}
      />
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>Ship date for the new order:</span>
        <DatePicker value={shipDate} onChange={setShipDate} placeholder="Keep current dates" />
      </div>
      {movedUnits > 0 && movedUnits === totalUnits && (
        <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
          Leave at least some quantity on the original order.
        </Typography.Text>
      )}
    </Modal>
  );
}

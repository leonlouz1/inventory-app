import { useState } from "react";
import dayjs from "dayjs";
import { Modal, Form, Input, InputNumber, Select, DatePicker, Button, Table, Typography, Tag, message } from "antd";
import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { containersApi } from "../api/inventory";
import { CONTAINER_STATUS_OPTIONS } from "../constants/containers";


// Shows the received-minus-ordered difference, e.g. -24 (red) or +6 (blue)
export function DifferenceTag({ value }) {
  if (value == null) return null;
  if (value === 0) return <Tag color="green">±0</Tag>;
  return <Tag color={value < 0 ? "red" : "blue"}>{value > 0 ? `+${value}` : value}</Tag>;
}

// New container (details + SKU lines) or edit an existing one's details.
export function ContainerFormModal({ container, warehouses, products, orders, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isNew = !container;
  const received = container?.status === "RECEIVED";

  async function handleOk() {
    const values = await form.validateFields();
    const payload = {
      containerNumber: values.containerNumber,
      poNumber: values.poNumber,
      supplier: values.supplier,
      warehouseId: values.warehouseId,
      etd: values.etd ? values.etd.format("YYYY-MM-DD") : null,
      eta: values.eta.format("YYYY-MM-DD"),
      blNumber: values.blNumber,
      notes: values.notes,
      ...(!received && { status: values.status }),
      ...(isNew && { lines: values.lines }),
    };
    setSaving(true);
    try {
      const saved = isNew ? await containersApi.create(payload) : await containersApi.update(container.id, payload);
      message.success(isNew ? "Container logged" : "Container updated");
      onSaved(saved);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const productOptions = products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` }));
  const orderOptions = orders
    .filter((o) => o.status !== "SHIPPED" && o.status !== "CANCELLED")
    .map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer}` }));

  return (
    <Modal
      title={isNew ? "Log container" : `Edit container ${container.containerNumber || ""}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText={isNew ? "Log container" : "Save"}
      confirmLoading={saving}
      width={760}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={container
          ? {
              ...container,
              etd: container.etd ? dayjs(container.etd) : null,
              eta: container.eta ? dayjs(container.eta) : null,
            }
          : { status: "IN_PRODUCTION", lines: [{}] }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 12 }}>
          <Form.Item name="containerNumber" label="Container #"><Input placeholder="e.g. MSCU1234567" /></Form.Item>
          <Form.Item name="poNumber" label="PO #"><Input placeholder="One or more, e.g. PO-88, PO-91" /></Form.Item>
          <Form.Item name="supplier" label="Supplier / factory"><Input /></Form.Item>
          <Form.Item name="warehouseId" label="Destination warehouse" rules={[{ required: true, message: "Required" }]}>
            <Select disabled={received} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
          </Form.Item>
          <Form.Item name="etd" label="ETD (departs)"><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="eta" label="ETA (arrives)" rules={[{ required: true, message: "Required" }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="blNumber" label="BL #"><Input /></Form.Item>
          {!received && (
            <Form.Item name="status" label="Status"><Select options={CONTAINER_STATUS_OPTIONS} /></Form.Item>
          )}
        </div>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>

        {isNew && (
          <>
            <Typography.Title level={5}>SKUs on this container</Typography.Title>
            <Form.List name="lines">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <div key={key} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 2fr auto", gap: 8, alignItems: "start" }}>
                      <Form.Item name={[name, "sku"]} rules={[{ required: true, message: "Pick a SKU" }]}>
                        <Select
                          showSearch
                          placeholder="SKU"
                          options={productOptions}
                          filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
                        />
                      </Form.Item>
                      <Form.Item name={[name, "quantity"]} rules={[{ required: true, message: "Qty" }]}>
                        <InputNumber min={1} precision={0} placeholder="Ordered qty" style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item name={[name, "linkedOrderId"]}>
                        <Select allowClear showSearch placeholder="Linked order (optional)" options={orderOptions}
                          filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())} />
                      </Form.Item>
                      <Button type="text" icon={<MinusCircleOutlined />} disabled={fields.length === 1} onClick={() => remove(name)} />
                    </div>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({})} block>Add SKU</Button>
                </>
              )}
            </Form.List>
          </>
        )}
      </Form>
    </Modal>
  );
}

// Receive: confirm each line's ordered quantity or change it to what arrived.
// The received quantities go into stock; the difference is kept.
export function ReceiveContainerModal({ container, onClose, onReceived }) {
  const pending = container.lines.filter((l) => l.status !== "RECEIVED");
  const [received, setReceived] = useState(() => Object.fromEntries(pending.map((l) => [l.id, l.orderedQuantity])));
  const [saving, setSaving] = useState(false);

  const totalOrdered = pending.reduce((s, l) => s + l.orderedQuantity, 0);
  const totalReceived = pending.reduce((s, l) => s + (received[l.id] ?? 0), 0);

  async function handleOk() {
    setSaving(true);
    try {
      const saved = await containersApi.receive(
        container.id,
        pending.map((l) => ({ id: l.id, receivedQuantity: received[l.id] ?? 0 }))
      );
      const diff = saved.difference;
      message.success(diff ? `Received, ${diff > 0 ? "+" : ""}${diff} vs ordered` : "Received in full");
      onReceived(saved);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Receive container ${container.containerNumber || ""}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText="Receive into stock"
      confirmLoading={saving}
      width={720}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Each line starts at what was ordered. Change any line to what actually arrived. The received quantities are
        added to {container.warehouseName || "the warehouse"} and the difference is kept.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={pending}
        columns={[
          { title: "SKU", dataIndex: "sku" },
          { title: "Product", dataIndex: "productName" },
          { title: "Ordered", dataIndex: "orderedQuantity", align: "right" },
          {
            title: "Received",
            key: "received",
            width: 130,
            render: (_, l) => (
              <InputNumber
                min={0}
                precision={0}
                value={received[l.id]}
                onChange={(v) => setReceived((prev) => ({ ...prev, [l.id]: v ?? 0 }))}
                style={{ width: "100%" }}
              />
            ),
          },
          { title: "Difference", key: "diff", align: "right", render: (_, l) => <DifferenceTag value={(received[l.id] ?? 0) - l.orderedQuantity} /> },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2}><strong>Total</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right"><strong>{totalOrdered}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right"><strong>{totalReceived}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right"><DifferenceTag value={totalReceived - totalOrdered} /></Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    </Modal>
  );
}

// Move part of a container onto a new one (e.g. a big order that ships in
// several containers). Run it again to split into a third, and so on.
export function SplitContainerModal({ container, onClose, onSplit }) {
  const [move, setMove] = useState({});
  const [containerNumber, setContainerNumber] = useState("");
  const [eta, setEta] = useState(container.eta ? dayjs(container.eta) : null);
  const [saving, setSaving] = useState(false);

  const moving = container.lines.reduce((s, l) => s + (move[l.id] || 0), 0);
  const total = container.lines.reduce((s, l) => s + l.orderedQuantity, 0);
  const canSplit = moving > 0 && moving < total;

  async function handleOk() {
    setSaving(true);
    try {
      const created = await containersApi.split(container.id, {
        containerNumber,
        eta: eta ? eta.format("YYYY-MM-DD") : undefined,
        lines: container.lines.filter((l) => move[l.id] > 0).map((l) => ({ lineId: l.id, quantity: move[l.id] })),
      });
      message.success(`Moved ${moving} units to a new container${created.containerNumber ? ` (${created.containerNumber})` : ""}`);
      onSplit(created);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Split container ${container.containerNumber || ""}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText="Create new container"
      okButtonProps={{ disabled: !canSplit }}
      confirmLoading={saving}
      width={720}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Enter how much of each SKU goes on the new container. The rest stays on this one. The new container keeps
        the same supplier, PO, warehouse and status. Split again for a third container.
      </Typography.Paragraph>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ marginBottom: 4 }}>New container #</div>
          <Input value={containerNumber} onChange={(e) => setContainerNumber(e.target.value)} placeholder="Optional, add later" />
        </div>
        <div>
          <div style={{ marginBottom: 4 }}>New container ETA</div>
          <DatePicker value={eta} onChange={setEta} style={{ width: "100%" }} />
        </div>
      </div>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={container.lines}
        columns={[
          { title: "SKU", dataIndex: "sku" },
          { title: "Product", dataIndex: "productName" },
          { title: "On this container", dataIndex: "orderedQuantity", align: "right" },
          {
            title: "Move to new",
            key: "move",
            width: 170,
            render: (_, l) => (
              <span style={{ display: "flex", gap: 4 }}>
                <InputNumber
                  min={0}
                  max={l.orderedQuantity}
                  precision={0}
                  value={move[l.id] || 0}
                  onChange={(v) => setMove((prev) => ({ ...prev, [l.id]: v || 0 }))}
                  style={{ width: 100 }}
                />
                <Button size="small" type="link" onClick={() => setMove((prev) => ({ ...prev, [l.id]: l.orderedQuantity }))}>All</Button>
              </span>
            ),
          },
          { title: "Stays", key: "stays", align: "right", render: (_, l) => l.orderedQuantity - (move[l.id] || 0) },
        ]}
      />
      {moving > 0 && moving === total && (
        <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>Leave something on this container.</Typography.Text>
      )}
    </Modal>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Form,
  Input,
  DatePicker,
  Button,
  Select,
  InputNumber,
  Table,
  Tag,
  message,
  Space,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { ordersApi } from "../api/inventory";

let lineKeyCounter = 0;
function nextLineKey() {
  lineKeyCounter += 1;
  return `line-${lineKeyCounter}`;
}

function emptyLine() {
  return { key: nextLineKey(), sku: undefined, warehouseId: undefined, quantity: undefined, shipDate: undefined };
}

function ProjectionTags({ projection }) {
  if (!projection) {
    return <Tag>Not checked yet</Tag>;
  }
  const tags = [];
  if (projection.warehouseUnassigned) {
    tags.push(<Tag color="default" key="unassigned">⚠ No warehouse assigned</Tag>);
  } else {
    const wp = projection.warehouseProjection;
    tags.push(
      <Tag color={wp.ok ? "green" : "red"} key="wh">
        {wp.ok ? `✓ ${wp.balance} available` : `⚠ Shortfall: ${wp.balance} (deficit ${wp.deficit})`}
      </Tag>
    );
  }
  if (projection.networkShortage) {
    tags.push(
      <Tag color="volcano" key="net">
        ⚠ Network shortage ({projection.networkProjectedBalance})
      </Tag>
    );
  }
  return <>{tags}</>;
}

export default function NewOrderModal({ open, onClose, onCreated, products, warehouses }) {
  const [form] = Form.useForm();
  const [lines, setLines] = useState([emptyLine()]);
  const [projectionsByKey, setProjectionsByKey] = useState({});
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  const skuOptions = useMemo(
    () => products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products]
  );
  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ value: w.id, label: w.name })),
    [warehouses]
  );

  useEffect(() => {
    if (!open) return;
    const completeLines = lines.filter((l) => l.sku && l.shipDate && l.quantity > 0);
    if (completeLines.length === 0) {
      setProjectionsByKey({});
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setChecking(true);
      try {
        const result = await ordersApi.create({
          dry_run: true,
          lines: completeLines.map((l) => ({
            sku: l.sku,
            warehouse_id: l.warehouseId ?? undefined,
            quantity: l.quantity,
            ship_date: l.shipDate.format("YYYY-MM-DD"),
          })),
        });
        if (requestId !== requestIdRef.current) return; // stale response, ignore
        const byKey = {};
        completeLines.forEach((line, i) => {
          byKey[line.key] = result.lines[i];
        });
        setProjectionsByKey(byKey);
      } catch (err) {
        if (requestId === requestIdRef.current) {
          message.error(`Projection check failed: ${err.message}`);
        }
      } finally {
        if (requestId === requestIdRef.current) setChecking(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, open]);

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function resetAndClose() {
    form.resetFields();
    setLines([emptyLine()]);
    setProjectionsByKey({});
    onClose();
  }

  async function doSave(headerValues) {
    setSaving(true);
    try {
      await ordersApi.create({
        order_number: headerValues.order_number,
        customer: headerValues.customer,
        customer_po: headerValues.customer_po || undefined,
        order_date: headerValues.order_date.format("YYYY-MM-DD"),
        notes: headerValues.notes || undefined,
        lines: lines
          .filter((l) => l.sku && l.shipDate && l.quantity > 0)
          .map((l) => ({
            sku: l.sku,
            warehouse_id: l.warehouseId ?? undefined,
            quantity: l.quantity,
            ship_date: l.shipDate.format("YYYY-MM-DD"),
          })),
      });
      message.success(`Order ${headerValues.order_number} created`);
      resetAndClose();
      onCreated();
    } catch (err) {
      message.error(`Failed to create order: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const headerValues = await form.validateFields();
    const validLines = lines.filter((l) => l.sku && l.shipDate && l.quantity > 0);
    if (validLines.length === 0) {
      message.error("Add at least one complete line item (SKU, quantity, ship date)");
      return;
    }

    const hasShortfall = validLines.some((l) => {
      const p = projectionsByKey[l.key];
      return p && ((p.warehouseProjection && !p.warehouseProjection.ok) || p.networkShortage);
    });

    if (hasShortfall) {
      Modal.confirm({
        title: "Some lines have projected shortfalls",
        content: "One or more line items will not be fully covered by stock and incoming restocks. Save anyway?",
        okText: "Save anyway",
        cancelText: "Go back",
        onOk: () => doSave(headerValues),
      });
      return;
    }

    doSave(headerValues);
  }

  const columns = [
    {
      title: "SKU",
      dataIndex: "sku",
      render: (_, line) => (
        <Select
          showSearch
          placeholder="Select SKU"
          style={{ width: 220 }}
          options={skuOptions}
          value={line.sku}
          filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          onChange={(value) => updateLine(line.key, { sku: value })}
        />
      ),
    },
    {
      title: "Warehouse",
      dataIndex: "warehouseId",
      render: (_, line) => (
        <Select
          allowClear
          placeholder="Unassigned"
          style={{ width: 150 }}
          options={warehouseOptions}
          value={line.warehouseId}
          onChange={(value) => updateLine(line.key, { warehouseId: value })}
        />
      ),
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      render: (_, line) => (
        <InputNumber
          min={1}
          placeholder="Qty"
          value={line.quantity}
          onChange={(value) => updateLine(line.key, { quantity: value })}
        />
      ),
    },
    {
      title: "Ship Date",
      dataIndex: "shipDate",
      render: (_, line) => (
        <DatePicker value={line.shipDate} onChange={(value) => updateLine(line.key, { shipDate: value })} />
      ),
    },
    {
      title: "Projection",
      key: "projection",
      render: (_, line) => <ProjectionTags projection={projectionsByKey[line.key]} />,
    },
    {
      title: "",
      key: "actions",
      render: (_, line) => (
        <Button
          icon={<DeleteOutlined />}
          danger
          type="text"
          onClick={() => removeLine(line.key)}
          disabled={lines.length === 1}
        />
      ),
    },
  ];

  return (
    <Modal
      title="New Order"
      open={open}
      onCancel={resetAndClose}
      width={920}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          Save Order
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" initialValues={{ order_date: dayjs() }}>
        <Space size="large" style={{ display: "flex" }}>
          <Form.Item name="order_number" label="Order #" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="SO-1001" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="customer" label="Customer" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="Acme Corp" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="customer_po" label="Customer PO #">
            <Input placeholder="PO-44213" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="order_date" label="Order Date" rules={[{ required: true, message: "Required" }]}>
            <DatePicker />
          </Form.Item>
        </Space>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Optional notes" />
        </Form.Item>
      </Form>

      <Table
        columns={columns}
        dataSource={lines}
        rowKey="key"
        pagination={false}
        size="small"
        loading={checking}
      />
      <Button icon={<PlusOutlined />} onClick={addLine} style={{ marginTop: 12 }}>
        Add line
      </Button>
    </Modal>
  );
}

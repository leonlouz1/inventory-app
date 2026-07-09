import { useEffect, useMemo, useState } from "react";
import { Modal, Form, Select, InputNumber, DatePicker, Input, Table, Button, message } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { restocksApi } from "../api/inventory";

let restockLineKeyCounter = 0;
function nextRestockLineKey() {
  restockLineKeyCounter += 1;
  return `restock-line-${restockLineKeyCounter}`;
}

function emptyRestockLine() {
  return { key: nextRestockLineKey(), sku: undefined, quantity: undefined };
}

// Logs a restock shipment that may contain multiple SKUs arriving together
// (e.g. several SKUs on the same shipping container) — one warehouse,
// expected date, and supplier/PO shared across all line items.
export function NewRestockModal({ open, onClose, onCreated, products, warehouses, orders }) {
  const [form] = Form.useForm();
  const [lines, setLines] = useState([emptyRestockLine()]);
  const [saving, setSaving] = useState(false);

  const skuOptions = useMemo(
    () => products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products]
  );
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name })), [warehouses]);
  const orderOptions = useMemo(
    () => (orders || []).filter((o) => o.status !== "CANCELLED").map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer}` })),
    [orders]
  );

  function updateLine(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyRestockLine()]);
  }

  function removeLine(key) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function resetAndClose() {
    form.resetFields();
    setLines([emptyRestockLine()]);
    onClose();
  }

  async function handleOk() {
    const validLines = lines.filter((l) => l.sku && l.quantity > 0);
    if (validLines.length === 0) {
      message.error("Add at least one line item with a SKU and quantity");
      return;
    }
    const duplicateSkus = validLines
      .map((l) => l.sku)
      .filter((sku, i, all) => all.indexOf(sku) !== i);
    if (duplicateSkus.length > 0) {
      message.error(`Each SKU can only appear once per shipment (duplicate: ${duplicateSkus[0]})`);
      return;
    }

    try {
      const headerValues = await form.validateFields();
      setSaving(true);
      // Tag all lines from this submission with a shared shipmentId so the
      // Restocks page can group them back into one shipment row.
      const shipmentId = validLines.length > 1 ? crypto.randomUUID() : undefined;
      await Promise.all(
        validLines.map((line) =>
          restocksApi.create({
            sku: line.sku,
            warehouseId: headerValues.warehouseId,
            quantity: line.quantity,
            expectedDate: headerValues.expectedDate.format("YYYY-MM-DD"),
            supplier: headerValues.supplier,
            shipmentId,
            linkedOrderId: line.linkedOrderId || null,
          })
        )
      );
      message.success(
        validLines.length === 1 ? "Restock logged" : `Restock logged for ${validLines.length} SKUs`
      );
      resetAndClose();
      onCreated();
    } catch (err) {
      if (err.errorFields) return; // form validation error, already shown inline
      message.error(`Failed to log restock: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const lineColumns = [
    {
      title: "SKU",
      dataIndex: "sku",
      render: (_, line) => (
        <Select
          showSearch
          placeholder="Select SKU"
          style={{ width: 260 }}
          options={skuOptions}
          value={line.sku}
          filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          onChange={(value) => updateLine(line.key, { sku: value })}
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
      title: "Link to Order (optional)",
      dataIndex: "linkedOrderId",
      render: (_, line) => (
        <Select
          allowClear
          showSearch
          placeholder="None"
          style={{ width: 220 }}
          options={orderOptions}
          value={line.linkedOrderId}
          filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          onChange={(value) => updateLine(line.key, { linkedOrderId: value })}
        />
      ),
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
      title="Log Restock"
      open={open}
      onCancel={resetAndClose}
      width={900}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleOk}>
          Save
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: "Required" }]}>
          <Select placeholder="Select warehouse" options={warehouseOptions} />
        </Form.Item>
        <Form.Item name="expectedDate" label="Expected Date" rules={[{ required: true, message: "Required" }]}>
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="supplier" label="Supplier / PO">
          <Input placeholder="Acme Manufacturing" />
        </Form.Item>
      </Form>

      <Table columns={lineColumns} dataSource={lines} rowKey="key" pagination={false} size="small" />
      <Button icon={<PlusOutlined />} onClick={addLine} style={{ marginTop: 12 }}>
        Add SKU
      </Button>
    </Modal>
  );
}

export function EditRestockModal({ open, onClose, onUpdated, restock, warehouses, orders, products }) {
  const [form] = Form.useForm();
  const skuOptions = useMemo(
    () => (products || []).map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products]
  );
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name })), [warehouses]);
  const orderOptions = useMemo(
    () => (orders || []).filter((o) => o.status !== "CANCELLED").map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer}` })),
    [orders]
  );

  useEffect(() => {
    if (restock) {
      form.setFieldsValue({
        sku: restock.sku,
        warehouseId: restock.warehouseId,
        quantity: restock.quantity,
        expectedDate: dayjs(restock.expectedDate),
        supplier: restock.supplier,
        linkedOrderId: restock.linkedOrderId ?? null,
      });
    }
  }, [restock, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await restocksApi.update(restock.id, {
        sku: values.sku,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
        expectedDate: values.expectedDate.format("YYYY-MM-DD"),
        supplier: values.supplier,
        linkedOrderId: values.linkedOrderId || null,
      });
      message.success("Restock updated");
      onClose();
      onUpdated();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to update restock: ${err.message}`);
    }
  }

  return (
    <Modal
      title="Edit Restock Line"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="sku" label="SKU" rules={[{ required: true, message: "Required" }]}>
          <Select
            showSearch
            options={skuOptions}
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
        <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: "Required" }]}>
          <Select options={warehouseOptions} />
        </Form.Item>
        <Form.Item name="quantity" label="Qty" rules={[{ required: true, message: "Required" }]}>
          <InputNumber min={1} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="expectedDate" label="Expected Date" rules={[{ required: true, message: "Required" }]}>
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="supplier" label="Supplier / PO">
          <Input />
        </Form.Item>
        <Form.Item name="linkedOrderId" label="Link to Order (optional)">
          <Select allowClear showSearch placeholder="None" options={orderOptions}
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Modal to add a new SKU line to an existing restock shipment group
export function AddRestockSkuModal({ open, onClose, onCreated, group, products, orders }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const existingSkus = useMemo(() => new Set((group?.lines || []).map((l) => l.sku)), [group]);
  const skuOptions = useMemo(
    () => (products || [])
      .filter((p) => !existingSkus.has(p.sku))
      .map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products, existingSkus]
  );
  const orderOptions = useMemo(
    () => (orders || []).filter((o) => o.status !== "CANCELLED").map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer}` })),
    [orders]
  );

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      // Use the group's shared shipmentId (or generate one if this was a single-line restock)
      const shipmentId = group.shipmentId || crypto.randomUUID();
      // If the group had no shipmentId before, patch the existing line too so they become grouped
      if (!group.shipmentId && group.lines.length === 1) {
        await restocksApi.update(group.lines[0].id, { shipmentId });
      }
      await restocksApi.create({
        sku: values.sku,
        warehouseId: group.lines[0].warehouseId,
        quantity: values.quantity,
        expectedDate: group.lines[0].expectedDate,
        supplier: group.lines[0].supplier,
        shipmentId,
        linkedOrderId: values.linkedOrderId || null,
      });
      message.success("SKU added to restock");
      onClose();
      onCreated();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to add SKU: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Add SKU to Restock"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Add"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="sku" label="SKU" rules={[{ required: true, message: "Required" }]}>
          <Select
            showSearch
            placeholder="Select SKU"
            options={skuOptions}
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
        <Form.Item name="quantity" label="Qty" rules={[{ required: true, message: "Required" }]}>
          <InputNumber min={1} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="linkedOrderId" label="Link to Order (optional)">
          <Select allowClear showSearch placeholder="None" options={orderOptions}
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

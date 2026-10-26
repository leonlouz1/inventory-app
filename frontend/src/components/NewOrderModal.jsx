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
  Upload,
  Typography,
} from "antd";
import { PlusOutlined, DeleteOutlined, FileSearchOutlined, CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { ordersApi, crmApi } from "../api/inventory";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "../constants/orderStatuses";
import { uploadOrderDocument } from "../utils/orderDocuments";
import PoViewer from "./PoViewer";

const PO_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.xlsm,.csv,.doc,.docx";

const STATUS_OPTIONS = ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }));

let lineKeyCounter = 0;
function nextLineKey() {
  lineKeyCounter += 1;
  return `line-${lineKeyCounter}`;
}

function emptyLine() {
  return { key: nextLineKey(), sku: undefined, warehouseId: undefined, quantity: undefined };
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

// With a PO file (poFile, or picked with "Upload PO"), the PO shows on the left
// so lines can be typed in while reading it; the file is kept on the order.
export default function NewOrderModal({ open, onClose, onCreated, products, warehouses, poFile: initialPoFile = null }) {
  const [form] = Form.useForm();
  const [pickedPo, setPickedPo] = useState(null);
  const [poRemoved, setPoRemoved] = useState(false);
  const poFile = poRemoved ? null : pickedPo || initialPoFile;
  const [lines, setLines] = useState([emptyLine()]);
  const [projectionsByKey, setProjectionsByKey] = useState({});
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeCustomers, setActiveCustomers] = useState([]);
  const [shipDate, setShipDate] = useState(null);
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
    ordersApi
      .nextNumber()
      .then(({ orderNumber }) => form.setFieldValue("order_number", orderNumber))
      .catch(() => {});
    crmApi.activeCustomers().then(setActiveCustomers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const completeLines = lines.filter((l) => l.sku && l.quantity > 0);
    if (completeLines.length === 0 || !shipDate) {
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
            ship_date: shipDate.format("YYYY-MM-DD"),
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
  }, [lines, shipDate, open]);

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
    setShipDate(null);
    setPickedPo(null);
    setPoRemoved(false);
    onClose();
  }

  async function doSave(headerValues) {
    setSaving(true);
    try {
      const result = await ordersApi.create({
        order_number: headerValues.order_number || undefined,
        customer: headerValues.customer,
        customer_po: headerValues.customer_po || undefined,
        order_date: headerValues.order_date.format("YYYY-MM-DD"),
        cancel_date: headerValues.cancel_date ? headerValues.cancel_date.format("YYYY-MM-DD") : undefined,
        status: headerValues.status,
        notes: headerValues.notes || undefined,
        lines: lines
          .filter((l) => l.sku && l.quantity > 0)
          .map((l) => ({
            sku: l.sku,
            warehouse_id: l.warehouseId ?? undefined,
            quantity: l.quantity,
            ship_date: headerValues.ship_date.format("YYYY-MM-DD"),
          })),
      });
      if (poFile) {
        try {
          await uploadOrderDocument(result.order.id, poFile);
        } catch (err) {
          message.warning(`Order created, but the PO file wasn't saved: ${err.message}. Add it from the order page.`);
        }
      }
      message.success(`Order ${result.order.orderNumber} created${poFile ? " with its PO on file" : ""}`);
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
    const validLines = lines.filter((l) => l.sku && l.quantity > 0);
    if (validLines.length === 0) {
      message.error("Add at least one complete line item (SKU and quantity)");
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
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingRight: 32 }}>
          <span>New Order</span>
          {poFile ? (
            <span style={{ fontWeight: 400, fontSize: 13 }}>
              <Typography.Text type="secondary">PO: </Typography.Text>{poFile.name}
              <Button size="small" type="text" icon={<CloseOutlined />} title="Remove PO" onClick={() => setPoRemoved(true)} />
            </span>
          ) : (
            <Upload
              accept={PO_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => { setPickedPo(file); setPoRemoved(false); return false; }}
            >
              <Button size="small" icon={<FileSearchOutlined />}>Upload PO</Button>
            </Upload>
          )}
        </div>
      }
      open={open}
      onCancel={resetAndClose}
      width={poFile ? "96vw" : 920}
      style={poFile ? { top: 16, maxWidth: 1800 } : undefined}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={saving} onClick={handleSave}>
          Save Order
        </Button>,
      ]}
    >
      <div style={poFile ? { display: "flex", gap: 16, alignItems: "stretch" } : undefined}>
      {poFile && (
        <div style={{ flex: "1 1 50%", minWidth: 0, height: "calc(100vh - 170px)" }}>
          <PoViewer file={poFile} />
        </div>
      )}
      <div style={poFile ? { flex: "1 1 50%", minWidth: 0, height: "calc(100vh - 170px)", overflowY: "auto", paddingRight: 4 } : undefined}>
      <Form form={form} layout="vertical" initialValues={{ order_date: dayjs(), status: "CONFIRMED" }}>
        <Space size="large" style={{ display: "flex" }} wrap={!!poFile}>
          <Form.Item name="order_number" label="Order #" extra="Auto-generated; clear to regenerate">
            <Input placeholder="SO-1001" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="customer" label="Customer" rules={[{ required: true, message: "Required" }]}>
            <Select
              showSearch
              placeholder="Select active customer"
              style={{ width: 260 }}
              options={activeCustomers.map((r) => ({ value: r.name, label: r.name }))}
              filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="customer_po" label="Customer PO #">
            <Input placeholder="PO-44213" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="order_date" label="Order Date" rules={[{ required: true, message: "Required" }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="ship_date" label="Ship Date" rules={[{ required: true, message: "Required" }]}>
            <DatePicker onChange={(value) => setShipDate(value)} />
          </Form.Item>
          <Form.Item
            name="cancel_date"
            label="Cancel Date"
            tooltip="The customer's do-not-ship-after date from the PO"
            dependencies={["ship_date"]}
            rules={[({ getFieldValue }) => ({
              validator: (_, v) => (v && getFieldValue("ship_date") && v.isBefore(getFieldValue("ship_date"), "day")
                ? Promise.reject(new Error("Before the ship date")) : Promise.resolve()),
              warningOnly: true,
            })]}
          >
            <DatePicker />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={STATUS_OPTIONS} style={{ width: 130 }} />
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
      </div>
      </div>
    </Modal>
  );
}

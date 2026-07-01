import { useState } from "react";
import { Modal, Button, Table, Tag, Upload, message, Typography } from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import dayjs from "dayjs";
import { restocksApi } from "../api/inventory";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(v) {
  return DATE_RE.test(v) && dayjs(v).isValid();
}

function buildTemplateCsv() {
  const headers = ["sku", "warehouse", "quantity", "expected_date", "supplier", "linked_order"];
  const rows = [
    ["WDG-101", "East", "500", "2026-08-01", "Acme Manufacturing", "SO-1001"],
    ["WDG-102", "East", "200", "2026-08-01", "Acme Manufacturing", ""],
    ["WDG-103", "West", "300", "2026-08-15", "", ""],
  ];
  return Papa.unparse([headers, ...rows]);
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function validateRow(row, products, warehouses, orders) {
  const skuSet = new Set(products.map((p) => p.sku));
  const warehouseByName = new Map(warehouses.map((w) => [w.name.toLowerCase(), w]));
  const orderByNumber = new Map(orders.map((o) => [o.orderNumber.toLowerCase(), o]));

  const sku = (row.sku || "").trim();
  const warehouseName = (row.warehouse || "").trim();
  const quantity = Number(row.quantity);
  const expectedDate = (row.expected_date || "").trim();
  const supplier = (row.supplier || "").trim();
  const linkedOrderRaw = (row.linked_order || "").trim();

  if (!sku) return { ...row, error: "Missing SKU" };
  if (!skuSet.has(sku)) return { ...row, error: `Unknown SKU "${sku}"` };
  if (!Number.isFinite(quantity) || quantity <= 0) return { ...row, error: `Invalid quantity` };
  if (!isValidDate(expectedDate)) return { ...row, error: `Invalid expected_date "${expectedDate}" (use YYYY-MM-DD)` };

  let warehouseId;
  if (warehouseName) {
    const w = warehouseByName.get(warehouseName.toLowerCase());
    if (!w) return { ...row, error: `Unknown warehouse "${warehouseName}"` };
    warehouseId = w.id;
  } else {
    return { ...row, error: "Missing warehouse" };
  }

  let linkedOrderId;
  if (linkedOrderRaw) {
    const o = orderByNumber.get(linkedOrderRaw.toLowerCase());
    if (!o) return { ...row, error: `Unknown order "${linkedOrderRaw}"` };
    linkedOrderId = o.id;
  }

  return {
    sku,
    warehouseId,
    quantity,
    expectedDate,
    supplier: supplier || undefined,
    linkedOrderId: linkedOrderId || null,
    _display: { sku, warehouse: warehouseName, quantity, expectedDate, supplier: supplier || "—", linkedOrder: linkedOrderRaw || "—" },
    error: null,
  };
}

export default function BulkImportRestocksModal({ open, onClose, onImported, products, warehouses, orders }) {
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);

  function handleFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validated = results.data.map((r, i) => ({
          key: i,
          ...validateRow(r, products, warehouses, orders || []),
        }));
        setRows(validated);
      },
      error: (err) => message.error(`Failed to parse CSV: ${err.message}`),
    });
    return false;
  }

  function resetAndClose() {
    setRows([]);
    onClose();
  }

  async function handleImport() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) {
      message.error("No valid rows to import");
      return;
    }

    setImporting(true);
    let succeeded = 0;
    const failures = [];

    // Group consecutive rows that share the same warehouse+date+supplier into
    // one shipment so multi-SKU containers get a shared shipmentId.
    const batches = [];
    for (const r of valid) {
      const batchKey = `${r.warehouseId}|${r.expectedDate}|${r.supplier || ""}`;
      const last = batches[batches.length - 1];
      if (last && last.batchKey === batchKey) {
        last.rows.push(r);
      } else {
        batches.push({ batchKey, rows: [r] });
      }
    }

    for (const batch of batches) {
      const shipmentId = batch.rows.length > 1 ? crypto.randomUUID() : undefined;
      for (const r of batch.rows) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await restocksApi.create({
            sku: r.sku,
            warehouseId: r.warehouseId,
            quantity: r.quantity,
            expectedDate: r.expectedDate,
            supplier: r.supplier,
            linkedOrderId: r.linkedOrderId,
            shipmentId,
          });
          succeeded += 1;
        } catch (err) {
          failures.push(`${r.sku}: ${err.message}`);
        }
      }
    }

    setImporting(false);
    if (failures.length === 0) {
      message.success(`Imported ${succeeded} restock line${succeeded === 1 ? "" : "s"}`);
      resetAndClose();
    } else {
      message.warning(`Imported ${succeeded}, ${failures.length} failed: ${failures.join("; ")}`);
    }
    onImported();
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.length - validCount;

  const columns = [
    { title: "SKU", dataIndex: ["_display", "sku"], render: (v, r) => r._display?.sku || r.sku || "—" },
    { title: "Warehouse", render: (_, r) => r._display?.warehouse || "—" },
    { title: "Qty", render: (_, r) => r._display?.quantity ?? "—" },
    { title: "Expected Date", render: (_, r) => r._display?.expectedDate || "—" },
    { title: "Supplier", render: (_, r) => r._display?.supplier || "—" },
    { title: "Linked Order", render: (_, r) => r._display?.linkedOrder || "—" },
    {
      title: "Validation",
      dataIndex: "error",
      render: (error) => (error ? <Tag color="red">{error}</Tag> : <Tag color="green">Valid</Tag>),
    },
  ];

  return (
    <Modal
      title="Import Restocks from CSV"
      open={open}
      onCancel={resetAndClose}
      width={860}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>Cancel</Button>,
        <Button key="import" type="primary" loading={importing} disabled={validCount === 0} onClick={handleImport}>
          Import {validCount > 0 ? `${validCount} Line${validCount === 1 ? "" : "s"}` : ""}
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">
        Download the template, fill in one row per SKU line, then upload it here. Columns:{" "}
        <b>sku</b>, <b>warehouse</b> (by name), <b>quantity</b>, <b>expected_date</b> (YYYY-MM-DD),{" "}
        <b>supplier</b> (optional), <b>linked_order</b> (optional — order number to link this line to).
        Consecutive rows sharing the same warehouse, date, and supplier are automatically grouped
        into one container shipment.
      </Typography.Paragraph>

      <Button
        icon={<DownloadOutlined />}
        onClick={() => downloadCsv("restock_import_template.csv", buildTemplateCsv())}
        style={{ marginBottom: 16 }}
      >
        Download Template
      </Button>

      <Upload accept=".csv" beforeUpload={handleFile} maxCount={1} showUploadList={false}>
        <Button icon={<UploadOutlined />}>Select CSV File</Button>
      </Upload>

      {rows.length > 0 && (
        <>
          <Typography.Paragraph style={{ marginTop: 16 }}>
            {validCount} valid line{validCount === 1 ? "" : "s"}, {errorCount} with errors (errors will be skipped)
          </Typography.Paragraph>
          <Table columns={columns} dataSource={rows} rowKey="key" pagination={{ pageSize: 10 }} size="small" />
        </>
      )}
    </Modal>
  );
}

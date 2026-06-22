import { useState } from "react";
import { Modal, Button, Table, Tag, Upload, message, Typography } from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import dayjs from "dayjs";
import { ordersApi } from "../api/inventory";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidDate(value) {
  return DATE_RE.test(value) && dayjs(value).isValid();
}

function buildTemplateCsv() {
  const headers = ["order_number", "customer", "customer_po", "order_date", "notes", "sku", "warehouse", "quantity", "ship_date"];
  const rows = [
    ["SO-2001", "Acme Corp", "PO-1234", "2026-07-01", "", "WDG-101", "East", "50", "2026-08-15"],
    ["SO-2001", "Acme Corp", "PO-1234", "2026-07-01", "", "WDG-102", "East", "25", "2026-08-15"],
    ["", "Initech", "", "2026-07-02", "", "WDG-103", "West", "10", "2026-08-20"],
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

// Groups flat CSV rows into orders. Rows sharing a non-blank order_number
// become one multi-line order; rows with a blank order_number each become
// their own single-line order (auto-numbered by the backend).
function groupRows(dataRows) {
  const groups = [];
  const byOrderNumber = new Map();
  dataRows.forEach((row, i) => {
    const orderNumber = (row.order_number || "").trim();
    if (orderNumber) {
      let group = byOrderNumber.get(orderNumber);
      if (!group) {
        group = { key: orderNumber, orderNumber, rows: [] };
        byOrderNumber.set(orderNumber, group);
        groups.push(group);
      }
      group.rows.push(row);
    } else {
      groups.push({ key: `auto-${i}`, orderNumber: null, rows: [row] });
    }
  });
  return groups;
}

function validateGroup(group, products, warehouses) {
  const skuSet = new Set(products.map((p) => p.sku));
  const warehouseByName = new Map(warehouses.map((w) => [w.name.toLowerCase(), w]));

  const first = group.rows[0];
  const customer = (first.customer || "").trim();
  const customerPo = (first.customer_po || "").trim();
  const orderDate = (first.order_date || "").trim();
  const notes = (first.notes || "").trim();

  if (!customer) return { ...group, error: "Missing customer" };
  if (!isValidDate(orderDate)) {
    return { ...group, error: `Invalid order_date "${orderDate}" (expected YYYY-MM-DD)` };
  }

  const lines = [];
  for (const row of group.rows) {
    const sku = (row.sku || "").trim();
    const warehouseName = (row.warehouse || "").trim();
    const quantity = Number(row.quantity);
    const shipDate = (row.ship_date || "").trim();

    if (!sku) return { ...group, error: "A line is missing a SKU" };
    if (!skuSet.has(sku)) return { ...group, error: `Unknown SKU "${sku}"` };
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ...group, error: `Invalid quantity for SKU "${sku}"` };
    }
    if (!isValidDate(shipDate)) {
      return { ...group, error: `Invalid ship_date "${shipDate}" for SKU "${sku}"` };
    }
    let warehouseId;
    if (warehouseName) {
      const w = warehouseByName.get(warehouseName.toLowerCase());
      if (!w) return { ...group, error: `Unknown warehouse "${warehouseName}"` };
      warehouseId = w.id;
    }
    lines.push({ sku, warehouse_id: warehouseId, quantity, ship_date: shipDate });
  }

  return {
    ...group,
    customer,
    customerPo: customerPo || undefined,
    orderDate,
    notes: notes || undefined,
    lines,
    error: null,
  };
}

export default function BulkImportOrdersModal({ open, onClose, onImported, products, warehouses }) {
  const [groups, setGroups] = useState([]);
  const [importing, setImporting] = useState(false);

  function handleFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const grouped = groupRows(results.data);
        const validated = grouped.map((g) => validateGroup(g, products, warehouses));
        setGroups(validated);
      },
      error: (err) => message.error(`Failed to parse CSV: ${err.message}`),
    });
    return false;
  }

  function resetAndClose() {
    setGroups([]);
    onClose();
  }

  async function handleImport() {
    const validGroups = groups.filter((g) => !g.error);
    if (validGroups.length === 0) {
      message.error("No valid orders to import");
      return;
    }

    setImporting(true);
    let succeeded = 0;
    const failures = [];
    for (const group of validGroups) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await ordersApi.create({
          order_number: group.orderNumber || undefined,
          customer: group.customer,
          customer_po: group.customerPo,
          order_date: group.orderDate,
          notes: group.notes,
          lines: group.lines,
        });
        succeeded += 1;
      } catch (err) {
        failures.push(`${group.orderNumber || "(auto)"}: ${err.message}`);
      }
    }
    setImporting(false);

    if (failures.length === 0) {
      message.success(`Imported ${succeeded} order${succeeded === 1 ? "" : "s"}`);
      resetAndClose();
    } else {
      message.warning(
        `Imported ${succeeded} order${succeeded === 1 ? "" : "s"}, ${failures.length} failed: ${failures.join("; ")}`
      );
    }
    onImported();
  }

  const validCount = groups.filter((g) => !g.error).length;
  const errorCount = groups.length - validCount;

  const columns = [
    { title: "Order #", dataIndex: "orderNumber", render: (v) => v || "(auto)" },
    { title: "Customer", dataIndex: "customer", render: (v) => v || "—" },
    { title: "PO #", dataIndex: "customerPo", render: (v) => v || "—" },
    { title: "Order Date", dataIndex: "orderDate", render: (v) => v || "—" },
    { title: "# Lines", key: "lineCount", render: (_, g) => g.rows.length },
    {
      title: "Status",
      dataIndex: "error",
      render: (error) => (error ? <Tag color="red">{error}</Tag> : <Tag color="green">Valid</Tag>),
    },
  ];

  return (
    <Modal
      title="Import Orders from CSV"
      open={open}
      onCancel={resetAndClose}
      width={820}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          Cancel
        </Button>,
        <Button key="import" type="primary" loading={importing} disabled={validCount === 0} onClick={handleImport}>
          Import {validCount > 0 ? `${validCount} Order${validCount === 1 ? "" : "s"}` : ""}
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">
        Download the template, fill in one row per order line item, then upload it here. Rows sharing the same
        order_number become one multi-line order; leave order_number blank to auto-generate one (each blank row
        becomes its own single-line order). Columns: order_number, customer, customer_po, order_date (YYYY-MM-DD),
        notes, sku, warehouse (optional, by name), quantity, ship_date (YYYY-MM-DD).
      </Typography.Paragraph>

      <Button
        icon={<DownloadOutlined />}
        onClick={() => downloadCsv("order_import_template.csv", buildTemplateCsv())}
        style={{ marginBottom: 16 }}
      >
        Download Template
      </Button>

      <Upload accept=".csv" beforeUpload={handleFile} maxCount={1} showUploadList={false}>
        <Button icon={<UploadOutlined />}>Select CSV File</Button>
      </Upload>

      {groups.length > 0 && (
        <>
          <Typography.Paragraph style={{ marginTop: 16 }}>
            {validCount} valid order{validCount === 1 ? "" : "s"}, {errorCount} with errors (errors will be skipped
            on import)
          </Typography.Paragraph>
          <Table columns={columns} dataSource={groups} rowKey="key" pagination={{ pageSize: 10 }} size="small" />
        </>
      )}
    </Modal>
  );
}

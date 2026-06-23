import { useState } from "react";
import { Modal, Button, Table, Tag, Upload, message, Typography } from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import { productsApi } from "../api/inventory";
import { PRODUCT_CATEGORIES } from "../constants/categories";

function buildTemplateCsv(warehouses) {
  const headers = [
    "sku",
    "name",
    "brand",
    "category",
    "reorderPoint",
    "reorderQty",
    "leadTimeDays",
    ...warehouses.map((w) => w.name),
  ];
  const exampleRow = [
    "WDG-101",
    "Example Widget",
    "Acme",
    PRODUCT_CATEGORIES[0],
    "20",
    "100",
    "21",
    ...warehouses.map(() => "0"),
  ];
  return Papa.unparse([headers, exampleRow]);
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

// Validates and normalizes one parsed CSV row against the current warehouse
// list. Returns { ...normalized fields, error: string | null }.
function validateRow(row, warehouses, seenSkus) {
  const sku = (row.sku || "").trim();
  const name = (row.name || "").trim();
  const brand = (row.brand || "").trim();
  const category = (row.category || "").trim();

  if (!sku) return { sku, name, error: "Missing SKU" };
  if (!name) return { sku, name, error: "Missing name" };
  if (seenSkus.has(sku)) return { sku, name, error: "Duplicate SKU in file" };
  if (category && !PRODUCT_CATEGORIES.includes(category)) {
    return { sku, name, error: `Unknown category "${category}"` };
  }

  const toInt = (value, fallback) => {
    if (value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : NaN;
  };

  const reorderPoint = toInt(row.reorderPoint, 0);
  const reorderQty = toInt(row.reorderQty, 0);
  const leadTimeDays = toInt(row.leadTimeDays, 21);
  if ([reorderPoint, reorderQty, leadTimeDays].some(Number.isNaN)) {
    return { sku, name, error: "reorderPoint/reorderQty/leadTimeDays must be numbers" };
  }

  const initialStock = [];
  for (const w of warehouses) {
    const raw = row[w.name];
    const onHand = toInt(raw, 0);
    if (Number.isNaN(onHand)) {
      return { sku, name, error: `"${w.name}" column must be a number` };
    }
    initialStock.push({ warehouseId: w.id, onHand });
  }

  return {
    sku,
    name,
    brand: brand || undefined,
    category: category || undefined,
    reorderPoint,
    reorderQty,
    leadTimeDays,
    initialStock,
    error: null,
  };
}

export default function BulkImportProductsModal({ open, onClose, onImported, warehouses }) {
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);

  function handleFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const seenSkus = new Set();
        const parsed = results.data.map((row, i) => {
          const validated = validateRow(row, warehouses, seenSkus);
          if (!validated.error) seenSkus.add(validated.sku);
          return { key: i, ...validated };
        });
        setRows(parsed);
      },
      error: (err) => message.error(`Failed to parse CSV: ${err.message}`),
    });
    return false; // prevent antd Upload from trying to actually upload the file anywhere
  }

  function resetAndClose() {
    setRows([]);
    onClose();
  }

  async function handleImport() {
    const validRows = rows.filter((r) => !r.error);
    if (validRows.length === 0) {
      message.error("No valid rows to import");
      return;
    }

    setImporting(true);
    let succeeded = 0;
    const failures = [];
    for (const row of validRows) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await productsApi.create({
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          category: row.category,
          reorderPoint: row.reorderPoint,
          reorderQty: row.reorderQty,
          leadTimeDays: row.leadTimeDays,
          initialStock: row.initialStock,
        });
        succeeded += 1;
      } catch (err) {
        failures.push(`${row.sku}: ${err.message}`);
      }
    }
    setImporting(false);

    if (failures.length === 0) {
      message.success(`Imported ${succeeded} product${succeeded === 1 ? "" : "s"}`);
      resetAndClose();
    } else {
      message.warning(
        `Imported ${succeeded} product${succeeded === 1 ? "" : "s"}, ${failures.length} failed: ${failures.join("; ")}`
      );
    }
    onImported();
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.length - validCount;

  const columns = [
    { title: "SKU", dataIndex: "sku" },
    { title: "Name", dataIndex: "name" },
    { title: "Brand", dataIndex: "brand", render: (v) => v || "—" },
    { title: "Category", dataIndex: "category", render: (v) => v || "—" },
    {
      title: "Status",
      dataIndex: "error",
      render: (error) => (error ? <Tag color="red">{error}</Tag> : <Tag color="green">Valid</Tag>),
    },
  ];

  return (
    <Modal
      title="Import Products from CSV"
      open={open}
      onCancel={resetAndClose}
      width={760}
      footer={[
        <Button key="cancel" onClick={resetAndClose}>
          Cancel
        </Button>,
        <Button
          key="import"
          type="primary"
          loading={importing}
          disabled={validCount === 0}
          onClick={handleImport}
        >
          Import {validCount > 0 ? `${validCount} Product${validCount === 1 ? "" : "s"}` : ""}
        </Button>,
      ]}
    >
      <Typography.Paragraph type="secondary">
        Download the template, fill in one row per product, then upload it here. Columns: sku, name, brand
        (optional, free text), category (optional, must match an existing category), reorderPoint, reorderQty,
        leadTimeDays, and one column per warehouse for initial on-hand quantity.
      </Typography.Paragraph>

      <Button
        icon={<DownloadOutlined />}
        onClick={() => downloadCsv("product_import_template.csv", buildTemplateCsv(warehouses))}
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
            {validCount} valid, {errorCount} with errors (errors will be skipped on import)
          </Typography.Paragraph>
          <Table columns={columns} dataSource={rows} rowKey="key" pagination={{ pageSize: 10 }} size="small" />
        </>
      )}
    </Modal>
  );
}

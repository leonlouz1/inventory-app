import { useEffect, useState } from "react";
import { Modal, Button, Select, Table, Typography, Upload, Alert, Space, Tag, message } from "antd";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { productsApi } from "../api/inventory";
import { loadFields } from "../hooks/useProductFields";
import { PRODUCT_CATEGORIES } from "../constants/categories";
import { PRODUCT_BRANDS } from "../constants/brands";

// Spreadsheet columns: [header, product key, kind]. Category fields (Color,
// Pack Size, Embossment, ...) are added after these from the field setup.
const BASE_COLUMNS = [
  ["SKU", "sku", "key"],
  ["Name", "name", "text"],
  ["Brand", "brand", "text"],
  ["Category", "category", "text"],
  ["Case Pack", "casePack", "int"],
  ["Lead Time (days)", "leadTimeDays", "int"],
  ["Wholesale Price", "wholesalePrice", "number"],
  ["Retail Price", "retailPrice", "number"],
  ["Description", "description", "text"],
  ["Image URL", "imageUrl", "text"],
];

function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object") return String(v.result ?? v.text ?? v.richText?.map((t) => t.text).join("") ?? v.hyperlink ?? "");
  return String(v).trim();
}

function currentValue(product, col) {
  if (col.attr) return product.attributes?.[col.key] ?? (col.key === "color" ? product.color : null);
  return product[col.key];
}

const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// Bulk edit products through a spreadsheet: download the current details,
// change them in Excel, upload, review every change, then apply.
// Blank cells are left unchanged.
export default function BulkEditProductsModal({ open, onClose, onUpdated }) {
  const [products, setProducts] = useState(null);
  const [fields, setFields] = useState([]);
  const [category, setCategory] = useState(null);
  const [changes, setChanges] = useState(null); // { rows, unknown, updates }
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([productsApi.details(), loadFields()])
      .then(([p, f]) => { setProducts(p); setFields(f); })
      .catch((err) => message.error(err.message));
  }, [open]);

  const columns = [
    ...BASE_COLUMNS.map(([header, key, kind]) => ({ header, key, kind })),
    ...fields.map((f) => ({ header: f.label, key: f.key, kind: f.key === "packSize" ? "int" : "text", attr: true })),
  ];

  async function download() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.key === "description" ? 40 : c.key === "name" ? 34 : 16 }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
    const rows = (products || []).filter((p) => !category || p.category === category);
    for (const p of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, currentValue(p, c) ?? ""])));
    const last = rows.length + 1;
    const list = (key, values) => {
      const idx = columns.findIndex((c) => c.key === key) + 1;
      for (let r = 2; r <= last; r++) {
        ws.getCell(r, idx).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",").replace(/"/g, "")}"`] };
      }
    };
    list("brand", PRODUCT_BRANDS);
    list("category", PRODUCT_CATEGORIES);
    ws.getColumn(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `products_${category ? category.replace(/\W+/g, "_") + "_" : ""}${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function readUpload(file) {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const headers = ws.getRow(1).values.map(cellText);
      const colByIndex = new Map();
      headers.forEach((h, i) => {
        const col = columns.find((c) => c.header.toLowerCase() === h.toLowerCase());
        if (col) colByIndex.set(i, col);
      });
      if (![...colByIndex.values()].some((c) => c.kind === "key")) {
        message.error("Couldn't find the SKU column. Use the downloaded spreadsheet.");
        return false;
      }
      const bySku = new Map(products.map((p) => [p.sku, p]));
      const rows = [];
      const unknown = [];
      const updates = [];
      const problems = [];
      ws.eachRow((row, r) => {
        if (r === 1) return;
        const values = new Map();
        row.eachCell({ includeEmpty: false }, (cell, i) => { if (colByIndex.has(i)) values.set(colByIndex.get(i), cellText(cell.value)); });
        const sku = [...values.entries()].find(([c]) => c.kind === "key")?.[1];
        if (!sku) return;
        const product = bySku.get(sku);
        if (!product) { unknown.push(sku); return; }
        const update = { sku };
        for (const [col, raw] of values) {
          if (col.kind === "key" || raw === "") continue; // blank = leave as is
          if (col.kind !== "text" && !Number.isFinite(Number(raw))) { problems.push(`${sku} ${col.header}: "${raw}" isn't a number`); continue; }
          if (col.key === "brand" && !PRODUCT_BRANDS.includes(raw)) { problems.push(`${sku}: unknown brand "${raw}"`); continue; }
          if (col.key === "category" && !PRODUCT_CATEGORIES.includes(raw)) { problems.push(`${sku}: unknown category "${raw}"`); continue; }
          const before = currentValue(product, col);
          if (same(before, raw)) continue;
          if (col.attr) update.attributes = { ...update.attributes, [col.key]: raw };
          else update[col.key] = raw;
          rows.push({ key: `${sku}-${col.key}`, sku, field: col.header, before: before ?? "", after: raw });
        }
        if (Object.keys(update).length > 1) updates.push(update);
      });
      setChanges({ rows, unknown, updates, problems });
    } catch (err) {
      message.error(`Couldn't read that file: ${err.message}`);
    }
    return false;
  }

  async function apply() {
    setApplying(true);
    try {
      const { updated } = await productsApi.bulkUpdate(changes.updates);
      message.success(`Updated ${updated} product${updated === 1 ? "" : "s"}`);
      setChanges(null);
      onUpdated?.();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal
      title="Bulk edit products"
      open={open}
      onCancel={() => { setChanges(null); onClose(); }}
      width={820}
      destroyOnHidden
      footer={changes ? [
        <Button key="back" onClick={() => setChanges(null)}>Choose another file</Button>,
        <Button key="apply" type="primary" loading={applying} disabled={!changes.updates.length} onClick={apply}>
          Apply {changes.rows.length} change{changes.rows.length === 1 ? "" : "s"} to {changes.updates.length} product{changes.updates.length === 1 ? "" : "s"}
        </Button>,
      ] : null}
    >
      {!changes ? (
        <>
          <Typography.Title level={5}>1. Download</Typography.Title>
          <Typography.Paragraph type="secondary">
            One row per SKU with its current details and category fields (Color, Pack Size, Embossment…).
          </Typography.Paragraph>
          <Space wrap style={{ marginBottom: 20 }}>
            <Select
              allowClear
              placeholder="All categories"
              style={{ width: 220 }}
              value={category}
              onChange={setCategory}
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
            <Button type="primary" icon={<DownloadOutlined />} disabled={!products} onClick={download}>Download spreadsheet</Button>
          </Space>
          <Typography.Title level={5}>2. Edit in Excel, then upload</Typography.Title>
          <Typography.Paragraph type="secondary">
            Change or fill in any cells. Blank cells are left as they are. You&apos;ll see every change before anything is saved.
          </Typography.Paragraph>
          <Upload accept=".xlsx" showUploadList={false} beforeUpload={readUpload} disabled={!products}>
            <Button icon={<UploadOutlined />} disabled={!products}>Upload edited spreadsheet</Button>
          </Upload>
        </>
      ) : (
        <>
          {changes.unknown.length > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message={`${changes.unknown.length} SKU${changes.unknown.length === 1 ? "" : "s"} not found, skipped: ${changes.unknown.slice(0, 8).join(", ")}${changes.unknown.length > 8 ? "…" : ""}`} />
          )}
          {changes.problems.length > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message={`${changes.problems.length} cell${changes.problems.length === 1 ? "" : "s"} skipped`}
              description={changes.problems.slice(0, 6).join(" · ")} />
          )}
          {changes.rows.length === 0 ? (
            <Alert type="info" showIcon message="No changes found. Everything in the file matches what's saved." />
          ) : (
            <Table
              size="small"
              rowKey="key"
              dataSource={changes.rows}
              pagination={{ pageSize: 12 }}
              columns={[
                { title: "SKU", dataIndex: "sku", width: 110 },
                { title: "Field", dataIndex: "field", width: 150 },
                { title: "Before", dataIndex: "before", render: (v) => (v === "" ? <Tag>empty</Tag> : String(v)) },
                { title: "After", dataIndex: "after", render: (v) => <strong>{v}</strong> },
              ]}
            />
          )}
        </>
      )}
    </Modal>
  );
}

import { useState } from "react";
import { Modal, Button, Upload, Table, Alert, Typography, Space, Tag, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import { crmApi } from "../../api/inventory";

// Maps the 6 product categories to their CSV column names (as exported from Google Sheets)
const CATEGORY_COLUMNS = [
  { category: "Travel",   buyerCol: "Travel Buyer",   statusCol: "Travel Status" },
  { category: "Bedding",  buyerCol: "Bedding Buyer",  statusCol: "Bedding Status" },
  { category: "Pet",      buyerCol: "Pet Buyer",      statusCol: "Pet Status" },
  { category: "Bath",     buyerCol: "Bath Buyer",     statusCol: "Bath Status" },
  { category: "Slippers", buyerCol: "Slippers Buyer", statusCol: "Slippers Status" },
  { category: "Storage",  buyerCol: "Storage Buyer",  statusCol: "Storage Status" },
];

const NAME_COLS = ["Name", "Account", "Retailer", "Company"];

function findNameCol(headers) {
  for (const c of NAME_COLS) {
    if (headers.includes(c)) return c;
  }
  return headers[0]; // fall back to first column
}

function parseRows(csv) {
  const result = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields || [];
  const nameCol = findNameCol(headers);

  return result.data
    .map((row) => {
      const name = (row[nameCol] || "").trim();
      if (!name) return null;

      const categories = CATEGORY_COLUMNS
        .map(({ category, buyerCol, statusCol }) => {
          const buyer = (row[buyerCol] || "").trim();
          const status = (row[statusCol] || "").trim();
          // Skip if status is explicitly N/A or blank
          if (!status || status.toLowerCase() === "n/a") return null;
          return { category, buyerName: buyer || null, status };
        })
        .filter(Boolean);

      return {
        name,
        type: (row["Type"] || "").trim() || null,
        priority: (row["Priority"] || "").trim() || "1 - Low",
        notes: (row["Notes"] || "").trim() || null,
        categories,
      };
    })
    .filter(Boolean);
}

const PREVIEW_COLS = [
  { title: "Retailer", dataIndex: "name", key: "name" },
  { title: "Type", dataIndex: "type", key: "type", render: (v) => v || "—" },
  { title: "Priority", dataIndex: "priority", key: "priority" },
  {
    title: "Categories with data",
    key: "cats",
    render: (_, row) =>
      row.categories.length === 0 ? (
        <Typography.Text type="secondary">None</Typography.Text>
      ) : (
        row.categories.map((c) => (
          <Tag key={c.category} style={{ marginBottom: 2 }}>
            {c.category}{c.buyerName ? ` — ${c.buyerName}` : ""}: {c.status}
          </Tag>
        ))
      ),
  },
];

export default function ImportCrmSheetModal({ open, onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function handleFile(file) {
    setParseError(null);
    setRows([]);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseRows(e.target.result);
        if (parsed.length === 0) {
          setParseError("No rows found. Make sure the file has a header row and at least one retailer.");
          return;
        }
        setRows(parsed);
        setFileName(file.name);
      } catch (err) {
        setParseError(`Could not read file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    return false;
  }

  async function handleImport() {
    setImporting(true);
    let created = 0, updated = 0, categoriesSet = 0;
    try {
      for (const row of rows) {
        // Upsert retailer
        const existing = await crmApi.listRetailers().then((list) =>
          list.find((r) => r.name.toLowerCase() === row.name.toLowerCase())
        );

        let retailerId;
        if (existing) {
          await crmApi.updateRetailer(existing.id, {
            type: row.type || existing.type,
            priority: row.priority || existing.priority,
            notes: row.notes || existing.notes,
          });
          retailerId = existing.id;
          updated++;
        } else {
          const created_ = await crmApi.createRetailer({
            name: row.name,
            type: row.type,
            priority: row.priority,
            notes: row.notes,
          });
          retailerId = created_.id;
          created++;
        }

        // Upsert each category
        for (const cat of row.categories) {
          await crmApi.updateCategory(retailerId, {
            category: cat.category,
            buyerName: cat.buyerName,
            status: cat.status,
          });
          categoriesSet++;
        }
      }

      setResult({ created, updated, categoriesSet });
      message.success("Import complete");
      onImported?.();
    } catch (err) {
      message.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setRows([]);
    setFileName(null);
    setParseError(null);
    setResult(null);
    onClose();
  }

  return (
    <Modal
      title="Import CRM from Google Sheets"
      open={open}
      onCancel={handleClose}
      width={860}
      footer={
        result ? (
          <Button type="primary" onClick={handleClose}>Done</Button>
        ) : (
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="primary" disabled={rows.length === 0} loading={importing} onClick={handleImport}>
              Import {rows.length > 0 ? `${rows.length} retailers` : ""}
            </Button>
          </Space>
        )
      }
    >
      {!result && (
        <>
          <Alert
            type="info"
            style={{ marginBottom: 16 }}
            message='Export your Google Sheet as CSV (File → Download → Comma-separated values), then upload it here.'
            description={
              <>
                The importer looks for these columns:{" "}
                <b>Type, Priority, Travel Buyer, Travel Status, Bedding Buyer, Bedding Status, Pet Buyer, Pet Status, Bath Buyer, Bath Status, Slippers Buyer, Slippers Status, Storage Buyer, Storage Status.</b>
                {" "}The first column is used as the retailer name. Existing retailers are updated; new ones are created.
                Categories marked <b>N/A</b> or blank are skipped.
              </>
            }
          />

          <Upload.Dragger accept=".csv" multiple={false} beforeUpload={handleFile} showUploadList={false} style={{ marginBottom: 16 }}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag your exported CSV here</p>
          </Upload.Dragger>

          {parseError && <Alert type="error" message={parseError} style={{ marginBottom: 12 }} />}

          {rows.length > 0 && (
            <>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                <b>{fileName}</b> — {rows.length} retailers found
              </Typography.Text>
              <Table
                columns={PREVIEW_COLS}
                dataSource={rows.map((r, i) => ({ ...r, key: i }))}
                pagination={{ pageSize: 10 }}
                size="small"
                bordered
              />
            </>
          )}
        </>
      )}

      {result && (
        <Alert
          type="success"
          message="Import complete"
          description={
            <>
              <div>{result.created} retailers created, {result.updated} updated</div>
              <div>{result.categoriesSet} buyer / status fields set</div>
            </>
          }
        />
      )}
    </Modal>
  );
}

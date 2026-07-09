import { useState } from "react";
import { Modal, Button, Upload, Alert, Table, Typography, Descriptions, message, Space } from "antd";
import { UploadOutlined, InboxOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { apiClient } from "../api/client";

function parseSheet(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        resolve(wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function buildPayload(wb) {
  // ── Warehouses ──────────────────────────────────────────────────────────
  const warehouseRows = parseSheet(wb, "Warehouses");
  const warehouses = warehouseRows.map((r) => ({ name: r["Name"], location: r["Location"] || null }));

  // ── Products ─────────────────────────────────────────────────────────────
  const productRows = parseSheet(wb, "Products");
  const products = productRows.map((r) => {
    const stock = {};
    for (const [key, val] of Object.entries(r)) {
      if (key.startsWith("Stock — ")) {
        const whName = key.replace("Stock — ", "");
        stock[whName] = Number(val) || 0;
      }
    }
    return {
      sku: r["SKU"],
      name: r["Name"],
      brand: r["Brand"] || null,
      category: r["Category"] || null,
      reorderPoint: Number(r["Reorder Point"]) || 0,
      reorderQty: Number(r["Reorder Qty"]) || 0,
      leadTimeDays: Number(r["Lead Time (days)"]) || 45,
      stock,
    };
  });

  // ── CRM Retailers ─────────────────────────────────────────────────────────
  // Rows are one-per-category; need to group by retailer name.
  const retailerRows = parseSheet(wb, "CRM Retailers");
  const retailerMap = {};
  for (const r of retailerRows) {
    const name = r["Retailer"];
    if (!name) continue;
    if (!retailerMap[name]) {
      retailerMap[name] = {
        name,
        type: r["Type"] || null,
        priority: r["Priority"] || "1 - Low",
        notes: r["Notes"] || null,
        categories: [],
      };
    }
    if (r["Category"]) {
      retailerMap[name].categories.push({
        category: r["Category"],
        buyerName: r["Buyer"] || null,
        status: r["Status"] || "Not Contacted",
      });
    }
  }
  const retailers = Object.values(retailerMap);

  // ── CRM Contacts ──────────────────────────────────────────────────────────
  const contactRows = parseSheet(wb, "CRM Contacts");
  const contacts = contactRows.map((r) => ({
    retailerName: r["Retailer"],
    name: r["Name"],
    title: r["Title"] || null,
    category: r["Category"] || null,
    email: r["Email"] || null,
    directPhone: r["Direct #"] || null,
    mobilePhone: r["Mobile #"] || null,
    hqPhone: r["HQ #"] || null,
    notes: r["Notes"] || null,
  }));

  // ── Orders ────────────────────────────────────────────────────────────────
  // Rows are one-per-line; group by order number.
  const orderRows = parseSheet(wb, "Orders");
  const orderMap = {};
  for (const r of orderRows) {
    const num = r["Order #"];
    if (!num) continue;
    if (!orderMap[num]) {
      orderMap[num] = {
        orderNumber: num,
        customer: r["Customer"] || "",
        customerPo: r["Customer PO #"] || null,
        orderDate: r["Order Date"],
        status: r["Status"] || "CONFIRMED",
        lines: [],
      };
    }
    if (r["SKU"]) {
      orderMap[num].lines.push({
        sku: r["SKU"],
        warehouseName: r["Warehouse"] || null,
        quantity: Number(r["Quantity"]) || 1,
        shipDate: r["Ship Date"],
      });
    }
  }
  const orders = Object.values(orderMap);

  // ── Restocks ──────────────────────────────────────────────────────────────
  const restockRows = parseSheet(wb, "Restocks");
  const restocks = restockRows.map((r) => ({
    sku: r["SKU"],
    warehouseName: r["Warehouse"],
    quantity: Number(r["Quantity"]) || 0,
    expectedDate: r["Expected Date"],
    supplier: r["Supplier"] || null,
    receivedAt: r["Received At"] || null,
    linkedOrderNumber: r["Linked Order"] || null,
    notes: r["Notes"] || null,
  }));

  // ── Shipments ─────────────────────────────────────────────────────────────
  // Rows are one-per-order; group by shipment number.
  const shipmentRows = parseSheet(wb, "Shipments");
  const shipmentMap = {};
  for (const r of shipmentRows) {
    const num = r["Shipment #"];
    if (!num) continue;
    if (!shipmentMap[num]) {
      shipmentMap[num] = {
        shipmentNumber: num,
        pickupDate: r["Pickup Date"],
        carrier: r["Carrier"] || null,
        csNumber: r["CS #"] || null,
        status: r["Status"] || "SCHEDULED",
        warehouseName: r["Warehouse"] || null,
        orderNumbers: [],
      };
    }
    if (r["Order #"]) shipmentMap[num].orderNumbers.push(r["Order #"]);
  }
  const shipments = Object.values(shipmentMap);

  // ── Activity Log ──────────────────────────────────────────────────────────
  const activityRows = parseSheet(wb, "Activity Log");
  const activity = activityRows.map((r) => ({
    date: r["Date"],
    retailerName: r["Retailer"],
    category: r["Category"] || null,
    rep: r["Rep"] || null,
    actionTaken: r["Action Taken"],
    notes: r["Notes"] || null,
    nextStep: r["Next Step"] || null,
    nextStepDate: r["Next Step Date"] || null,
    done: r["Done"] === "Yes",
  }));

  // ── Sent Tracker ──────────────────────────────────────────────────────────
  const sentRows = parseSheet(wb, "Sent Tracker");
  const sent = sentRows.map((r) => ({
    dateSent: r["Date Sent"],
    retailerName: r["Retailer"],
    category: r["Category"] || null,
    buyerName: r["Buyer"] || null,
    itemSent: r["Item Sent"],
    notes: r["Notes"] || null,
    responseReceived: r["Response"] || null,
    followUpDate: r["Follow-up Date"] || null,
    done: r["Done"] === "Yes",
  }));

  return { warehouses, products, retailers, contacts, orders, restocks, shipments, activity, sent };
}

const PREVIEW_COLUMNS = [
  { title: "Section", dataIndex: "section", key: "section" },
  { title: "Records found in file", dataIndex: "count", key: "count", align: "right" },
];

export default function ImportBackupModal({ open, onClose, onDone }) {
  const [payload, setPayload] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState(null);

  async function handleFile(file) {
    setParseError(null);
    setPayload(null);
    setResult(null);
    try {
      const wb = await parseExcel(file);
      const parsed = buildPayload(wb);
      setPayload(parsed);
      setFileName(file.name);
    } catch (err) {
      setParseError(`Could not read file: ${err.message}`);
    }
    return false; // prevent antd auto-upload
  }

  async function handleImport() {
    if (!payload) return;
    setImporting(true);
    try {
      const res = await apiClient.post("/import", payload);
      setResult(res.summary);
      message.success("Import complete");
    } catch (err) {
      message.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  function handleClose() {
    setPayload(null);
    setFileName(null);
    setResult(null);
    setParseError(null);
    onClose();
    if (result) onDone?.();
  }

  const previewData = payload
    ? [
        { section: "Warehouses", count: payload.warehouses.length },
        { section: "Products", count: payload.products.length },
        { section: "CRM Retailers", count: payload.retailers.length },
        { section: "CRM Contacts", count: payload.contacts.length },
        { section: "Orders", count: payload.orders.length },
        { section: "Restocks", count: payload.restocks.length },
        { section: "Shipments", count: payload.shipments.length },
        { section: "Activity Log entries", count: payload.activity.length },
        { section: "Sent Tracker entries", count: payload.sent.length },
      ]
    : [];

  return (
    <Modal
      title="Restore from Backup"
      open={open}
      onCancel={handleClose}
      width={560}
      footer={
        result ? (
          <Button type="primary" onClick={handleClose}>Done</Button>
        ) : (
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="primary" disabled={!payload} loading={importing} onClick={handleImport}>
              Import
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
            message="How this works"
            description={
              <>
                Upload an Excel backup file exported from this app.
                <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
                  <li>Warehouses and Products are <b>upserted</b> (created or updated).</li>
                  <li>CRM Retailers and Contacts are <b>upserted</b> by name — existing info is updated.</li>
                  <li>Orders, Restocks, and Shipments that already exist are <b>skipped</b>.</li>
                  <li>Activity Log and Sent Tracker entries are <b>always inserted</b> — avoid importing the same file twice or you'll get duplicates in those two sections.</li>
                </ul>
              </>
            }
          />

          <Upload.Dragger
            accept=".xlsx"
            multiple={false}
            beforeUpload={handleFile}
            showUploadList={false}
            style={{ marginBottom: 16 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Click or drag your backup .xlsx file here</p>
          </Upload.Dragger>

          {parseError && <Alert type="error" message={parseError} style={{ marginBottom: 12 }} />}

          {payload && (
            <>
              <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                File: <b>{fileName}</b>
              </Typography.Text>
              <Table
                columns={PREVIEW_COLUMNS}
                dataSource={previewData.map((r) => ({ ...r, key: r.section }))}
                pagination={false}
                size="small"
                bordered
              />
            </>
          )}
        </>
      )}

      {result && (
        <>
          <Alert type="success" message="Import complete" style={{ marginBottom: 16 }} />
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Warehouses">
              {result.warehouses.created} created, {result.warehouses.updated} updated
            </Descriptions.Item>
            <Descriptions.Item label="Products">
              {result.products.created} created, {result.products.updated} updated
              {result.stock.upserted > 0 && ` · ${result.stock.upserted} stock levels restored`}
            </Descriptions.Item>
            <Descriptions.Item label="CRM Retailers">
              {result.retailers.created} created, {result.retailers.updated} updated
            </Descriptions.Item>
            <Descriptions.Item label="CRM Contacts">
              {result.contacts.created} added, {result.contacts.skipped} skipped (already exist)
            </Descriptions.Item>
            <Descriptions.Item label="Orders">
              {result.orders.created} created, {result.orders.skipped} skipped (already exist)
            </Descriptions.Item>
            <Descriptions.Item label="Restocks">
              {result.restocks.created} created, {result.restocks.skipped} skipped
            </Descriptions.Item>
            <Descriptions.Item label="Shipments">
              {result.shipments.created} created, {result.shipments.skipped} skipped
            </Descriptions.Item>
            <Descriptions.Item label="Activity Log">{result.activity.created} entries added</Descriptions.Item>
            <Descriptions.Item label="Sent Tracker">{result.sent.created} entries added</Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Modal>
  );
}

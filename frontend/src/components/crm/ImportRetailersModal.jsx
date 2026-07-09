import { useState } from "react";
import { Modal, Button, Alert, Table, Typography, Space, Upload, message } from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import { crmApi } from "../../api/inventory";

const TEMPLATE_HEADERS = ["name", "type", "priority", "notes"];
const VALID_PRIORITIES = ["3 - High", "2 - Medium", "1 - Low"];

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS,
    ["DD's Discount", "Off-Price", "3 - High", ""],
    ["Burlington Coat", "Off-Price", "3 - High", ""],
    ["Big Lots", "Department Store", "2 - Medium", ""],
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "retailers_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportRetailersModal({ open, onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);

  function reset() {
    setRows([]);
    setErrors([]);
  }

  function handleFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const parsed = [];
        const errs = [];
        data.forEach((row, i) => {
          const name = (row.name || row.Name || "").trim();
          const type = (row.type || row.Type || "").trim();
          const priority = (row.priority || row.Priority || "1 - Low").trim();
          const notes = (row.notes || row.Notes || "").trim();

          if (!name) { errs.push(`Row ${i + 2}: missing name`); return; }
          if (!VALID_PRIORITIES.includes(priority)) errs.push(`Row ${i + 2}: unknown priority "${priority}", defaulting to "1 - Low"`);

          parsed.push({
            key: i,
            name,
            type: type || null,
            priority: VALID_PRIORITIES.includes(priority) ? priority : "1 - Low",
            notes: notes || null,
          });
        });
        setRows(parsed);
        setErrors(errs);
      },
    });
    return false;
  }

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);
    let ok = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await crmApi.createRetailer({ name: row.name, type: row.type, priority: row.priority, notes: row.notes });
        ok++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    if (failed > 0) message.warning(`Imported ${ok} retailers, ${failed} failed (duplicates skipped)`);
    else message.success(`Imported ${ok} retailers`);
    onImported();
    onClose();
    reset();
  }

  return (
    <Modal
      title="Import Retailers from CSV"
      open={open}
      onCancel={() => { onClose(); reset(); }}
      footer={null}
      width={700}
      destroyOnHidden
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>Download Template</Button>
          <Upload accept=".csv" beforeUpload={handleFile} showUploadList={false}>
            <Button icon={<UploadOutlined />}>Choose CSV File</Button>
          </Upload>
        </div>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Columns: <code>name</code> (required), <code>type</code>, <code>priority</code> (3 - High / 2 - Medium / 1 - Low), <code>notes</code>
        </Typography.Text>

        {errors.length > 0 && (
          <Alert
            type="warning"
            message={`${errors.length} warning(s)`}
            description={<ul style={{ margin: 0, paddingLeft: 16 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          />
        )}

        {rows.length > 0 && (
          <>
            <Typography.Text strong>{rows.length} retailers ready to import</Typography.Text>
            <Table
              size="small"
              rowKey="key"
              pagination={{ pageSize: 8 }}
              dataSource={rows}
              columns={[
                { title: "Name", dataIndex: "name" },
                { title: "Type", dataIndex: "type", render: (v) => v || "—" },
                { title: "Priority", dataIndex: "priority" },
                { title: "Notes", dataIndex: "notes", render: (v) => v || "—" },
              ]}
            />
            <Button type="primary" loading={importing} onClick={handleImport} style={{ width: "100%" }}>
              Import {rows.length} Retailers
            </Button>
          </>
        )}
      </Space>
    </Modal>
  );
}

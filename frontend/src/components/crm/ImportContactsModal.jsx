import { useState } from "react";
import { Modal, Button, Alert, Table, Tag, Typography, Space, Upload, message } from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import Papa from "papaparse";
import { crmApi } from "../../api/inventory";

function downloadTemplate() {
  const headers = ["company", "name", "title", "category", "email", "direct_phone", "mobile_phone", "hq_phone", "notes"];
  const examples = [
    ["DD's Discount", "Rachel Prescott", "Bedding Buyer", "Bedding", "rprescott@dds.com", "555-100-1001", "", "555-100-1000", ""],
    ["Big Lots", "Brandi Hojnowski", "Bath Buyer", "Bath", "bhojnowski@biglots.com", "614-278-6446", "", "", ""],
    ["Burlington Coat", "Mark Smith", "Travel Buyer", "Travel", "msmith@bcf.com", "", "609-555-1234", "609-387-7800", ""],
  ];
  const csv = [headers, ...examples].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contacts_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportContactsModal({ open, onClose, onImported, retailers }) {
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importing, setImporting] = useState(false);

  function reset() { setRows([]); setErrors([]); }

  // Build a name→id map (case-insensitive)
  const retailerMap = new Map(
    (retailers || []).map((r) => [r.name.toLowerCase().trim(), r.id])
  );

  function handleFile(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const parsed = [];
        const errs = [];
        data.forEach((row, i) => {
          const lineNum = i + 2;
          const company = (row.company || row.Company || "").trim();
          const name = (row.name || row.Name || "").trim();

          if (!company) { errs.push(`Row ${lineNum}: missing company`); return; }
          if (!name) { errs.push(`Row ${lineNum}: missing name`); return; }

          const retailerId = retailerMap.get(company.toLowerCase());
          if (!retailerId) {
            errs.push(`Row ${lineNum}: company "${company}" not found — add the retailer first`);
            return;
          }

          parsed.push({
            key: i,
            retailerId,
            company,
            name,
            title: (row.title || row.Title || "").trim() || null,
            category: (row.category || row.Category || "").trim() || null,
            email: (row.email || row.Email || "").trim() || null,
            directPhone: (row.direct_phone || row["Direct Phone"] || row.directPhone || "").trim() || null,
            mobilePhone: (row.mobile_phone || row["Mobile Phone"] || row.mobilePhone || "").trim() || null,
            hqPhone: (row.hq_phone || row["HQ Phone"] || row.hqPhone || "").trim() || null,
            notes: (row.notes || row.Notes || "").trim() || null,
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
        await crmApi.createContact({
          retailerId: row.retailerId,
          name: row.name,
          title: row.title,
          category: row.category,
          email: row.email,
          directPhone: row.directPhone,
          mobilePhone: row.mobilePhone,
          hqPhone: row.hqPhone,
          notes: row.notes,
        });
        ok++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    if (failed > 0) message.warning(`Imported ${ok} contacts, ${failed} failed`);
    else message.success(`Imported ${ok} contacts`);
    onImported();
    onClose();
    reset();
  }

  return (
    <Modal
      title="Import Contacts from CSV"
      open={open}
      onCancel={() => { onClose(); reset(); }}
      footer={null}
      width={820}
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
          Columns: <code>company</code> (must match an existing retailer), <code>name</code>, <code>title</code>,{" "}
          <code>category</code>, <code>email</code>, <code>direct_phone</code>, <code>mobile_phone</code>,{" "}
          <code>hq_phone</code>, <code>notes</code>
        </Typography.Text>

        {errors.length > 0 && (
          <Alert
            type="warning"
            message={`${errors.length} issue(s) found`}
            description={
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            }
          />
        )}

        {rows.length > 0 && (
          <>
            <Typography.Text strong>{rows.length} contacts ready to import</Typography.Text>
            <Table
              size="small"
              rowKey="key"
              pagination={{ pageSize: 8 }}
              dataSource={rows}
              scroll={{ x: "max-content" }}
              columns={[
                { title: "Company", dataIndex: "company" },
                { title: "Name", dataIndex: "name" },
                { title: "Title", dataIndex: "title", render: (v) => v || "—" },
                { title: "Category", dataIndex: "category", render: (v) => v ? <Tag>{v}</Tag> : "—" },
                { title: "Email", dataIndex: "email", render: (v) => v || "—" },
                { title: "Direct #", dataIndex: "directPhone", render: (v) => v || "—" },
                { title: "Mobile #", dataIndex: "mobilePhone", render: (v) => v || "—" },
                { title: "HQ #", dataIndex: "hqPhone", render: (v) => v || "—" },
              ]}
            />
            <Button type="primary" loading={importing} onClick={handleImport} style={{ width: "100%" }}>
              Import {rows.length} Contacts
            </Button>
          </>
        )}
      </Space>
    </Modal>
  );
}

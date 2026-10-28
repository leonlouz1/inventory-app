import { useState } from "react";
import { Alert, Modal, Select, Space, Table, Typography, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { crmApi } from "../../api/inventory";
import { CONTACT_CATEGORIES } from "../../constants/crm";
import { guessCategory, readCrmWorkbook } from "../../utils/crmWorkbook";

const cell = (row, ...keys) => {
  for (const k of keys) if (row[k] !== null && row[k] !== undefined && String(row[k]).trim() !== "") return String(row[k]);
  return "";
};

// Import one tab of the Excel CRM (a category NOTES tab, Cold Account Notes, or CONTACTS).
// Re-importing the same tab updates people instead of duplicating them.
export default function ImportCrmTabModal({ open, category: pageCategory, onClose, onImported }) {
  const [tabs, setTabs] = useState(null);
  const [tabName, setTabName] = useState(null);
  const [category, setCategory] = useState(pageCategory || null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  function reset() {
    setTabs(null);
    setTabName(null);
    setCategory(pageCategory || null);
    setResult(null);
  }

  async function readFile(file) {
    try {
      const found = await readCrmWorkbook(await file.arrayBuffer());
      if (!found.length) {
        message.error("No tab with Company and Buyer Name columns found");
        return false;
      }
      setTabs(found);
      // Prefer the tab for the category this page is about
      const match = (pageCategory && found.find((t) => guessCategory(t.name, [pageCategory]))) || found[0];
      pickTab(match.name, found);
    } catch (err) {
      message.error(`Couldn't read that file: ${err.message}`);
    }
    return false;
  }

  function pickTab(name, list = tabs) {
    setTabName(name);
    setResult(null);
    const guessed = guessCategory(name, CONTACT_CATEGORIES.filter((c) => c !== "Other"));
    setCategory(guessed || pageCategory || (/contact/i.test(name) ? "Other" : null));
    return list;
  }

  const tab = tabs?.find((t) => t.name === tabName);

  async function doImport() {
    if (!tab || !category) return;
    setImporting(true);
    try {
      const summary = await crmApi.importRows(category, tab.rows);
      setResult(summary);
      onImported?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      title="Import from the Excel CRM"
      open={open}
      width={900}
      onCancel={() => { reset(); onClose(); }}
      afterOpenChange={(o) => { if (!o) reset(); }}
      onOk={result ? () => { reset(); onClose(); } : doImport}
      okText={result ? "Done" : `Import ${tab ? tab.rows.length : ""} rows`}
      okButtonProps={{ disabled: !result && (!tab || !category || !tab.rows.length) }}
      confirmLoading={importing}
      destroyOnHidden
    >
      {!tabs ? (
        <Upload.Dragger accept=".xlsx,.xls" showUploadList={false} beforeUpload={readFile}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>Drop your CRM spreadsheet here, or click to pick it</p>
          <Typography.Text type="secondary">You'll pick which tab to bring in next.</Typography.Text>
        </Upload.Dragger>
      ) : result ? (
        <Alert
          type="success"
          showIcon
          message={`Imported ${result.rows} rows from "${tabName}"`}
          description={[
            `${result.contactsCreated} new contacts, ${result.contactsUpdated} updated`,
            `${result.retailersCreated} new retailers`,
            `${result.historyAdded} history entries added`,
            result.skipped ? `${result.skipped} rows skipped (no company or name)` : null,
          ].filter(Boolean).join(" · ")}
        />
      ) : (
        <>
          <Space wrap style={{ marginBottom: 12 }}>
            <span>Tab <Select value={tabName} onChange={(v) => pickTab(v)} style={{ width: 220 }}
              options={tabs.map((t) => ({ value: t.name, label: `${t.name} (${t.rows.length})` }))} /></span>
            <span>Category <Select value={category} onChange={setCategory} style={{ width: 140 }} placeholder="Pick one"
              options={CONTACT_CATEGORIES.map((c) => ({ value: c, label: c }))} /></span>
          </Space>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            Rows with their own Category column use it; the rest go under {category || "the category you pick"}.
            Each row's Notes become the buyer's first history entry, and its status and next follow-up carry over.
            People already in BasicCloud (same name at the same retailer) are updated, not duplicated.
          </Typography.Paragraph>
          <Table
            size="small"
            rowKey={(_, i) => i}
            dataSource={tab?.rows || []}
            pagination={{ pageSize: 8, size: "small" }}
            scroll={{ x: true }}
            columns={[
              { title: "Company", render: (_, r) => cell(r, "Company", "Retailer"), width: 140 },
              { title: "People", render: (_, r) => <span style={{ whiteSpace: "pre-wrap" }}>{cell(r, "Buyer Name", "Name")}</span>, width: 180 },
              { title: "Status", render: (_, r) => cell(r, "ACCOUNT STATUS", "STATUS"), width: 110 },
              { title: "Last updated", render: (_, r) => cell(r, "LAST UPDATED"), width: 100 },
              { title: "Notes", render: (_, r) => cell(r, "Notes") },
            ]}
          />
        </>
      )}
    </Modal>
  );
}

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Button, Modal, Popconfirm, Spin, Typography, Upload, message } from "antd";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, FileOutlined, PaperClipOutlined } from "@ant-design/icons";
import { orderDocumentsApi } from "../api/inventory";
import { fetchOrderDocument, saveFile, uploadOrderDocument } from "../utils/orderDocuments";
import PoViewer from "./PoViewer";

const sizeLabel = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// The PO and any other files kept on an order: view, download, add, remove
export default function OrderDocuments({ orderId, onChanged }) {
  const [docs, setDocs] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null); // File being shown

  const load = useCallback(
    () => orderDocumentsApi.list(orderId).then(setDocs).catch((err) => message.error(err.message)),
    [orderId]
  );
  useEffect(() => { load(); }, [load]);

  async function withFile(doc, fn) {
    setBusyId(doc.id);
    try {
      fn(await fetchOrderDocument(doc));
    } catch (err) {
      message.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function add(file) {
    setUploading(true);
    try {
      await uploadOrderDocument(orderId, file);
      message.success(`${file.name} added`);
      load();
      onChanged?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(doc) {
    try {
      await orderDocumentsApi.delete(doc.id);
      load();
      onChanged?.();
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>PO &amp; documents</Typography.Title>
        <Upload showUploadList={false} beforeUpload={(file) => { add(file); return false; }}>
          <Button icon={<PaperClipOutlined />} loading={uploading}>Add file</Button>
        </Upload>
      </div>
      {!docs ? <Spin size="small" /> : docs.length === 0 ? (
        <Typography.Text type="secondary">No files yet. Add the customer&apos;s PO to keep it with this order.</Typography.Text>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 8px", background: "#fafafa", borderRadius: 6 }}>
              <FileOutlined style={{ color: "#8c8c8c" }} />
              <a onClick={() => withFile(d, setViewing)}>{d.filename}</a>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {sizeLabel(d.size)} · added {dayjs(d.createdAt).format("MMM D, YYYY")}{d.uploadedBy ? ` by ${d.uploadedBy}` : ""}
              </Typography.Text>
              <span style={{ marginLeft: "auto" }}>
                <Button size="small" type="text" icon={<EyeOutlined />} loading={busyId === d.id} onClick={() => withFile(d, setViewing)}>View</Button>
                <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => withFile(d, saveFile)}>Download</Button>
                <Popconfirm title={`Remove ${d.filename}?`} okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => remove(d)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </span>
            </div>
          ))}
        </div>
      )}
      <Modal
        title={viewing?.name}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={viewing && <Button icon={<DownloadOutlined />} onClick={() => saveFile(viewing)}>Download</Button>}
        width="90vw"
        style={{ top: 16, maxWidth: 1400 }}
        destroyOnHidden
      >
        {viewing && <div style={{ height: "calc(100vh - 180px)" }}><PoViewer file={viewing} /></div>}
      </Modal>
    </div>
  );
}

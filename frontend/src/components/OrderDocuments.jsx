import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Button, Modal, Popconfirm, Select, Spin, Typography, Upload, message } from "antd";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, FileOutlined, InboxOutlined, PaperClipOutlined } from "@ant-design/icons";
import { DOCUMENT_KINDS, DOCUMENT_KIND_BY_VALUE } from "../constants/documentKinds";
import { orderDocumentsApi } from "../api/inventory";
import { fetchOrderDocument, saveFile, uploadOrderDocument } from "../utils/orderDocuments";
import PoViewer from "./PoViewer";

const sizeLabel = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const KIND_OPTIONS = DOCUMENT_KINDS.map((k) => ({ value: k.value, label: k.label }));

// The type a new file most likely is: the PO first, then the signed BOL once
// the order has shipped
function suggestedKind(docs, orderStatus) {
  const has = (kind) => docs?.some((d) => d.kind === kind);
  if (!has("PO")) return "PO";
  if (orderStatus === "SHIPPED" && !has("SIGNED_BOL")) return "SIGNED_BOL";
  return "OTHER";
}

// The PO and any other files kept on an order: view, download, add, remove,
// and what type each file is (PO, Signed BOL, ...)
export default function OrderDocuments({ orderId, orderStatus, onChanged }) {
  const [docs, setDocs] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null); // File being shown
  const [adding, setAdding] = useState(null); // { kind, file } while the Add file window is open

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

  async function add() {
    const { file, kind } = adding;
    setUploading(true);
    try {
      await uploadOrderDocument(orderId, file, kind);
      message.success(`${file.name} added as ${DOCUMENT_KIND_BY_VALUE[kind].label}`);
      setAdding(null);
      load();
      onChanged?.();
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function changeKind(doc, kind) {
    try {
      const updated = await orderDocumentsApi.update(doc.id, { kind });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      onChanged?.();
    } catch (err) {
      message.error(err.message);
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
        <Button icon={<PaperClipOutlined />} onClick={() => setAdding({ kind: suggestedKind(docs, orderStatus), file: null })}>
          Add file
        </Button>
      </div>
      {!docs ? <Spin size="small" /> : docs.length === 0 ? (
        <Typography.Text type="secondary">No files yet. Add the customer&apos;s PO to keep it with this order.</Typography.Text>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 8px", background: "#fafafa", borderRadius: 6 }}>
              <FileOutlined style={{ color: "#8c8c8c" }} />
              <Select
                size="small"
                value={d.kind}
                options={KIND_OPTIONS}
                onChange={(kind) => changeKind(d, kind)}
                style={{ width: 170 }}
                title="File type"
              />
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
        title="Add file"
        open={!!adding}
        onCancel={() => setAdding(null)}
        onOk={add}
        okText="Add"
        okButtonProps={{ disabled: !adding?.file }}
        confirmLoading={uploading}
        destroyOnHidden
      >
        {adding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ marginBottom: 4 }}>What is it?</div>
              <Select
                value={adding.kind}
                options={KIND_OPTIONS}
                onChange={(kind) => setAdding((a) => ({ ...a, kind }))}
                style={{ width: "100%" }}
              />
            </div>
            <Upload.Dragger
              showUploadList={false}
              beforeUpload={(file) => { setAdding((a) => ({ ...a, file })); return false; }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{adding.file ? adding.file.name : "Click or drag a file here"}</p>
              {adding.file && <p className="ant-upload-hint">Click to pick a different file</p>}
            </Upload.Dragger>
          </div>
        )}
      </Modal>
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

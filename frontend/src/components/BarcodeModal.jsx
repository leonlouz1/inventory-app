import { useEffect, useState } from "react";
import { Modal, Button, Space, Typography, Spin, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

// UPC-A barcode artwork for packaging. bwip-js is loaded only when needed.
// Standard UPC-A look (first/last digit outside the bars), with the white
// margin ("quiet zone") scanners need on each side.
const BARCODE_OPTIONS = { bcid: "upca", includetext: true, paddingwidth: 12, paddingheight: 4, backgroundcolor: "FFFFFF" };

async function loadBwip() {
  const { default: bwipjs } = await import("bwip-js");
  return bwipjs;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Shows a scannable UPC-A barcode for `upc` (12 digits) with SVG (vector, for
// the designer) and high-resolution PNG downloads.
export default function BarcodeModal({ upc, sku, label, onClose }) {
  const [svg, setSvg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    loadBwip()
      .then((bwipjs) => bwipjs.toSVG({ ...BARCODE_OPTIONS, text: upc, scale: 3, height: 22.85 }))
      .then((s) => { if (active) setSvg(s); })
      .catch((err) => { if (active) setError(err.message || String(err)); });
    return () => { active = false; };
  }, [upc]);

  const base = `UPC_${upc}${sku ? `_${sku}` : ""}`;

  function downloadSvg() {
    download(new Blob([svg], { type: "image/svg+xml" }), `${base}.svg`);
  }

  async function downloadPng() {
    try {
      const bwipjs = await loadBwip();
      const canvas = document.createElement("canvas");
      // scale 12 ≈ 1200 dpi-class output for print
      bwipjs.toCanvas(canvas, { ...BARCODE_OPTIONS, text: upc, scale: 12, height: 22.85 });
      canvas.toBlob((blob) => download(blob, `${base}.png`), "image/png");
    } catch (err) {
      message.error(`Couldn't make PNG: ${err.message || err}`);
    }
  }

  return (
    <Modal title={`Barcode — ${sku || upc}`} open onCancel={onClose} footer={null} width={460} destroyOnHidden>
      {label && <Typography.Paragraph strong style={{ marginBottom: 8 }}>{label}</Typography.Paragraph>}
      <div style={{ background: "#fff", border: "1px solid #f0f0f0", borderRadius: 6, padding: 16, textAlign: "center", minHeight: 140 }}>
        {error && <Typography.Text type="danger">{error}</Typography.Text>}
        {!error && !svg && <Spin />}
        {svg && <img alt={`UPC ${upc}`} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} style={{ maxWidth: "100%", height: 120 }} />}
      </div>
      <Typography.Paragraph type="secondary" style={{ margin: "12px 0" }}>
        UPC-A {upc}. Standard printed size is about 1.47&quot; × 1.02&quot; (37.3 × 25.9 mm). Keep it no smaller than
        80% of that and print it dark on a light background.
      </Typography.Paragraph>
      <Space>
        <Button type="primary" icon={<DownloadOutlined />} disabled={!svg} onClick={downloadSvg}>SVG (vector, for artwork)</Button>
        <Button icon={<DownloadOutlined />} disabled={!svg} onClick={downloadPng}>PNG (high-res)</Button>
      </Space>
    </Modal>
  );
}

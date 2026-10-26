import { useEffect, useMemo, useState } from "react";
import { Button, Segmented, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { saveFile } from "../utils/orderDocuments";

const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImage = (f) => f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.name);
const isSheet = (f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name);

const SHEET_STYLE = `<style>
  body { font: 12px Arial, sans-serif; margin: 8px; color: #222; }
  table { border-collapse: collapse; }
  td { border: 1px solid #ddd; padding: 3px 6px; white-space: nowrap; }
</style>`;

// Shows a PO file in the page: PDFs and images as they are, spreadsheets as a
// table (one tab per sheet). Anything else can be downloaded.
export default function PoViewer({ file, height = "100%" }) {
  const [sheets, setSheets] = useState(null);
  const [sheet, setSheet] = useState(null);
  const url = useMemo(() => (file && (isPdf(file) || isImage(file)) ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    if (!file || !isSheet(file)) return;
    let cancelled = false;
    (async () => {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const html = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" })]));
      if (!cancelled) {
        setSheets(html);
        setSheet(wb.SheetNames[0]);
      }
    })().catch(() => !cancelled && setSheets({}));
    return () => { cancelled = true; };
  }, [file]);

  const frame = { width: "100%", height, border: "1px solid #f0f0f0", borderRadius: 6, background: "#fff" };

  if (!file) return null;
  if (isPdf(file)) return url && <iframe title={file.name} src={url} style={frame} />;
  if (isImage(file)) {
    return url && (
      <div style={{ ...frame, overflow: "auto" }}>
        <img src={url} alt={file.name} style={{ width: "100%", display: "block" }} />
      </div>
    );
  }
  const names = sheets ? Object.keys(sheets) : [];
  if (isSheet(file) && names.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height, gap: 8 }}>
        {names.length > 1 && <Segmented size="small" value={sheet} onChange={setSheet} options={names} />}
        {/* sandboxed: the sheet's content can't run scripts or reach the app */}
        <iframe title={file.name} sandbox="" srcDoc={SHEET_STYLE + (sheets[sheet] || "")} style={{ ...frame, flex: 1 }} />
      </div>
    );
  }
  return (
    <div style={{ ...frame, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
      <Typography.Text type="secondary">
        {isSheet(file) && !sheets ? "Reading spreadsheet…" : `${file.name} can't be shown here.`}
      </Typography.Text>
      {!(isSheet(file) && !sheets) && <Button icon={<DownloadOutlined />} onClick={() => saveFile(file)}>Download to open it</Button>}
    </div>
  );
}

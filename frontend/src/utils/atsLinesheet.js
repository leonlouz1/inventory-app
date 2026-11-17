import { loadImage } from "./linesheetExport";

// ATS linesheet in the buyer-facing layout:
//   Picture | Style# | Description | Color | Brand | Case Pack | Cost | ATS | ATS <date> ...
// One block per style (SKU Group, else same product name): the picture spans the
// block's rows, and a short blank row separates blocks. "ATS" is what can sell
// now (all warehouses combined); each "ATS <date>" column is stock in production
// or en route arriving that date.

const BASE_COLUMNS = [
  { header: "Picture", width: 52.5 },
  { header: "Style#", width: 19.88 },
  { header: "Description", width: 62.38 },
  { header: "Color", width: 11.5 },
  { header: "Brand", width: 14.88 },
  { header: "Case\nPack", width: 9.88 },
  { header: "Cost", width: 8.88 },
  { header: "ATS", width: 10.5 },
];
const DATE_COL_WIDTH = 10.5;
const ROW_HEIGHT = 36.75; // points
const MIN_BLOCK_HEIGHT = 110; // points, so a one-SKU block still shows a usable picture
const GAP_ROW_HEIGHT = 12;
const FONT = { name: "Arial", size: 13 };
const BORDER = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
const MONEY = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)';

function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

// What each SKU can sell now, and per incoming date. Open orders beyond stock on
// hand (negative ATS) eat into the earliest incoming restocks first.
function atsBreakdown(p) {
  const now = Math.max(0, p.availableToSell ?? 0);
  let shortfall = Math.max(0, -(p.availableToSell ?? 0));
  const byDate = {};
  for (const r of [...(p.incoming || [])].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))) {
    const used = Math.min(shortfall, r.quantity);
    shortfall -= used;
    byDate[r.expectedDate] = (byDate[r.expectedDate] ?? 0) + (r.quantity - used);
  }
  return { now, byDate };
}

// Group products into style blocks, keeping only blocks with something to sell
// now or coming. Zero rows inside a block stay, so the buyer sees every color.
export function atsLinesheetBlocks(products) {
  const blocks = new Map();
  for (const p of products) {
    const key = p.groupId ? `g${p.groupId}` : `n${(p.name || p.sku).trim().toLowerCase()}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push({ ...p, ats: atsBreakdown(p) });
  }
  return [...blocks.values()]
    .map((items) => items.sort((a, b) => a.sku.localeCompare(b.sku)))
    .filter((items) => items.some((p) => p.ats.now > 0 || Object.values(p.ats.byDate).some((q) => q > 0)))
    .sort((a, b) => (a[0].brand || "").localeCompare(b[0].brand || "") || a[0].sku.localeCompare(b[0].sku));
}

function styleRow(row, dateCols) {
  row.font = FONT;
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let c = 1; c <= BASE_COLUMNS.length + dateCols; c++) row.getCell(c).border = BORDER;
}

// Returns { skus, missingImages }
export async function downloadAtsLinesheet(products, { title } = {}) {
  const blocks = atsLinesheetBlocks(products);
  const dates = [...new Set(blocks.flat().flatMap((p) => Object.keys(p.ats.byDate).filter((d) => p.ats.byDate[d] > 0)))].sort();
  const columns = [...BASE_COLUMNS, ...dates.map((d) => ({ header: `ATS\n${shortDate(d)}`, width: DATE_COL_WIDTH }))];

  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const header = ws.addRow(columns.map((c) => c.header));
  header.height = 36.75;
  styleRow(header, dates.length);

  let missingImages = 0;
  for (let b = 0; b < blocks.length; b++) {
    const items = blocks[b];
    const rowHeight = Math.max(ROW_HEIGHT, MIN_BLOCK_HEIGHT / items.length);
    const firstRow = ws.rowCount + 1;
    for (const p of items) {
      const row = ws.addRow([
        null,
        p.sku,
        p.name || "",
        p.color || "",
        p.brand || "",
        p.casePack ?? null,
        p.wholesalePrice ?? null,
        p.ats.now,
        ...dates.map((d) => p.ats.byDate[d] ?? 0),
      ]);
      row.height = rowHeight;
      styleRow(row, dates.length);
      row.getCell(7).numFmt = MONEY;
      for (let c = 8; c <= columns.length; c++) row.getCell(c).numFmt = "#,##0";
    }
    const lastRow = ws.rowCount;
    if (lastRow > firstRow) ws.mergeCells(firstRow, 1, lastRow, 1);

    const imageUrl = items.map((p) => p.imageUrl).find(Boolean);
    if (imageUrl) {
      const img = await loadImage(imageUrl);
      if (img) {
        const id = wb.addImage({ base64: img.base64, extension: "png" });
        // Fit inside the block's picture cell, centered, keeping proportions
        const rowPx = rowHeight * (96 / 72);
        const boxW = BASE_COLUMNS[0].width * 7 + 5;
        const boxH = items.length * rowPx;
        const scale = Math.min((boxW - 10) / img.width, (boxH - 10) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ws.addImage(id, {
          tl: { col: (boxW - w) / 2 / boxW, row: firstRow - 1 + (boxH - h) / 2 / rowPx },
          ext: { width: w, height: h },
          editAs: "oneCell",
        });
      } else {
        missingImages += 1;
      }
    }
    ws.addRow([]).height = GAP_ROW_HEIGHT;
  }

  const d = new Date();
  const stamp = `${d.getMonth() + 1}-${d.getDate()}-${String(d.getFullYear()).slice(2)}`;
  const name = `${(title ? `${title} ` : "").toUpperCase()}ATS ${stamp}`.replace(/[^\w &-]+/g, "").trim();
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { skus: blocks.flat().length, missingImages };
}

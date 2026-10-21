// Linesheet export in the buyer-facing layout:
//   Image | SKU | UPC | COLOR | CT | PRICE | QTY
// One block per product family: its image spans the block's rows, and a blank
// row separates blocks. No costs or margins are included.

const COLUMNS = [
  { header: "Image", width: 40 },
  { header: "SKU", width: 10 },
  { header: "UPC", width: 17 },
  { header: "COLOR", width: 14 },
  { header: "CT", width: 7 },
  { header: "PRICE", width: 11 },
  { header: "QTY", width: 10 },
];
const ROW_HEIGHT = 42; // points, like the original sheet
const MONEY = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)';

// Load an image into a PNG buffer for Excel (also normalizes WEBP etc.).
// Returns null when the image can't be loaded (e.g. another site blocks it).
async function loadImage(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    return { base64: dataUrl, width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

// blocks: [{ imageUrl, items: [{ sku, upc, color, ct, price, qty }] }]
// Returns how many block images couldn't be included.
export async function exportLinesheet(name, blocks) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((name || "Linesheet").slice(0, 31).replace(/[:\\/?*[\]]/g, "-"), {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const header = ws.addRow(COLUMNS.map((c) => c.header));
  header.font = { name: "Arial", size: 11, bold: true };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 16;

  let missingImages = 0;
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const firstRow = ws.rowCount + 1;
    for (const item of block.items) {
      // Number-only SKUs and pack counts go in as numbers (no "stored as text" flags)
      const asNumber = (v) => (v != null && /^\d+$/.test(String(v)) ? Number(v) : v ?? "");
      const row = ws.addRow([null, asNumber(item.sku), item.upc || "", (item.color || "").toUpperCase(), asNumber(item.ct), item.price ?? null, item.qty ?? null]);
      row.height = ROW_HEIGHT;
      row.font = { name: "Arial", size: 11 };
      row.alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(6).numFmt = MONEY;
      row.getCell(7).numFmt = "#,##0";
    }
    const lastRow = ws.rowCount;
    if (lastRow > firstRow) ws.mergeCells(firstRow, 1, lastRow, 1);

    if (block.imageUrl) {
      const img = await loadImage(block.imageUrl);
      if (img) {
        const id = wb.addImage({ base64: img.base64, extension: "png" });
        // Fit inside the block's image cell, keeping proportions
        const boxW = COLUMNS[0].width * 7 + 5;
        const boxH = (lastRow - firstRow + 1) * ROW_HEIGHT * (96 / 72);
        const scale = Math.min((boxW - 8) / img.width, (boxH - 8) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ws.addImage(id, {
          tl: { col: (boxW - w) / 2 / boxW, row: firstRow - 1 + ((boxH - h) / 2) / (ROW_HEIGHT * (96 / 72)) },
          ext: { width: w, height: h },
          editAs: "oneCell",
        });
      } else {
        missingImages += 1;
      }
    }
    if (b < blocks.length - 1) ws.addRow([]); // blank row between blocks
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(name || "Linesheet").replace(/[^\w -]+/g, "").trim() || "Linesheet"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return missingImages;
}

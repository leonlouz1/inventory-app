const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const ExcelJS = require("exceljs");

const prisma = new PrismaClient();

const GREEN_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
const RED_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF6B6B" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
const OPENING_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

const thin = { style: "thin", color: { argb: "FFD0D0D0" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function dateStr(d) {
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0];
}

// GET /api/reports/rolling-totals?warehouseId=X&sku=X
router.get("/rolling-totals", async (req, res) => {
  try {
    const { warehouseId, sku } = req.query;
    const whFilter = warehouseId ? { warehouseId: Number(warehouseId) } : {};
    const skuWhere = sku ? { product: { sku } } : {};

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Current on-hand stock per SKU
    const stockRows = await prisma.warehouseStock.findMany({
      where: { ...whFilter },
      include: { product: true },
    });
    const currentStock = {};
    const skuNames = {};
    for (const row of stockRows) {
      if (sku && row.product.sku !== sku) continue;
      const s = row.product.sku;
      currentStock[s] = (currentStock[s] || 0) + row.onHand;
      skuNames[s] = row.product.name;
    }

    // Restocks — past only (green, inbound positive)
    const restocks = await prisma.restock.findMany({
      where: { ...whFilter, ...skuWhere, expectedDate: { lte: today } },
      include: { product: true },
      orderBy: { expectedDate: "asc" },
    });

    // Order lines — SHIPPED only, past dates (red, outbound negative)
    const orderLines = await prisma.orderLine.findMany({
      where: {
        ...whFilter,
        ...skuWhere,
        shipDate: { lte: today },
        order: { status: "SHIPPED" },
      },
      include: { product: true, order: true },
      orderBy: { shipDate: "asc" },
    });

    // Collect all SKUs
    const allSkus = new Set([
      ...Object.keys(currentStock),
      ...restocks.map((r) => r.product.sku),
      ...orderLines.map((l) => l.product.sku),
    ]);

    // Build per-SKU event lists
    // Each event: { date, kind: "restock"|"outbound", qty, label, key }
    const skuEvents = {};
    for (const s of allSkus) skuEvents[s] = [];

    for (const r of restocks) {
      const s = r.product.sku;
      skuNames[s] = r.product.name;
      const d = dateStr(r.expectedDate);
      const label = r.supplier ? `Restock\n${r.supplier}` : `Restock\n${d}`;
      const key = `restock|||${d}|||${label}`;
      skuEvents[s].push({ date: d, kind: "restock", qty: r.quantity, label, key });
    }

    for (const l of orderLines) {
      const s = l.product.sku;
      skuNames[s] = l.product.name;
      const d = dateStr(l.shipDate);
      const label = `${l.order.orderNumber}\n${l.order.customer}`;
      const key = `outbound|||${d}|||${label}`;
      skuEvents[s].push({ date: d, kind: "outbound", qty: l.quantity, label, key });
    }

    // Build ordered global column list (deduplicated by key)
    // After each date group, insert a running total column
    const seenKeys = new Set();
    const eventCols = []; // { kind: "restock"|"outbound", date, label, key }
    for (const s of allSkus) {
      for (const ev of skuEvents[s]) {
        if (!seenKeys.has(ev.key)) {
          seenKeys.add(ev.key);
          eventCols.push({ kind: ev.kind, date: ev.date, label: ev.label, key: ev.key });
        }
      }
    }
    // Sort: by date asc, restocks before outbounds within same date, then label
    eventCols.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.kind !== b.kind) return a.kind === "restock" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    // Build final column definitions: opening | ...events | total-after-each-date-group
    // col: { colType: "opening"|"restock"|"outbound"|"total", label, key?, date? }
    const cols = [{ colType: "opening", label: "Opening\nBalance" }];
    for (let i = 0; i < eventCols.length; i++) {
      const ev = eventCols[i];
      cols.push({ colType: ev.kind, label: ev.label, key: ev.key, date: ev.date });
      const nextDate = eventCols[i + 1]?.date;
      if (ev.date !== nextDate) {
        // Format date nicely for total column header
        const parts = ev.date.split("-");
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        cols.push({ colType: "total", label: `Total\n${formatted}` });
      }
    }

    // Build workbook
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Rolling Totals");

    // Header row
    ws.getRow(1).height = 40;

    function headerCell(r, c, label, fill) {
      const cell = ws.getCell(r, c);
      cell.value = label;
      cell.fill = fill;
      cell.font = { bold: true, name: "Arial", size: 9, color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = border;
    }

    headerCell(1, 1, "SKU", HEADER_FILL);
    ws.getCell(1, 1).font = { bold: true, name: "Arial", size: 9, color: { argb: "FFFFFFFF" } };
    ws.getColumn(1).width = 16;

    headerCell(1, 2, "Product Name", HEADER_FILL);
    ws.getCell(1, 2).font = { bold: true, name: "Arial", size: 9, color: { argb: "FFFFFFFF" } };
    ws.getColumn(2).width = 24;

    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const c = ci + 3;
      const fill = col.colType === "opening" ? OPENING_FILL
        : col.colType === "restock" ? GREEN_FILL
        : col.colType === "outbound" ? RED_FILL
        : TOTAL_FILL;
      headerCell(1, c, col.label, fill);
      ws.getColumn(c).width = col.colType === "total" ? 9 : 12;
    }

    // Data rows
    const sortedSkus = Array.from(allSkus).sort();
    let rowIdx = 2;

    for (const s of sortedSkus) {
      const events = skuEvents[s] || [];
      // Back-calculate opening: current_on_hand - restocks_received + units_shipped
      // so the running total ends exactly at current on-hand
      const totalRestocks = events.filter((e) => e.kind === "restock").reduce((sum, e) => sum + e.qty, 0);
      const totalOutbounds = events.filter((e) => e.kind === "outbound").reduce((sum, e) => sum + e.qty, 0);
      const opening = (currentStock[s] || 0) - totalRestocks + totalOutbounds;

      // Map event key -> qty for this SKU
      const qtyByKey = {};
      for (const ev of events) {
        qtyByKey[ev.key] = (qtyByKey[ev.key] || 0) + ev.qty;
      }

      const row = ws.getRow(rowIdx);
      row.height = 16;

      function dataCell(c, value, fill, bold = false) {
        const cell = row.getCell(c);
        cell.value = value;
        if (fill) cell.fill = fill;
        cell.font = { name: "Arial", size: 9, bold };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = border;
        return cell;
      }

      // SKU and name left-aligned
      const skuCell = dataCell(1, s, null, true);
      skuCell.alignment = { vertical: "middle", horizontal: "left" };
      const nameCell = dataCell(2, skuNames[s] || "", null, false);
      nameCell.alignment = { vertical: "middle", horizontal: "left" };

      let running = opening;

      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const c = ci + 3;

        if (col.colType === "opening") {
          dataCell(c, opening, OPENING_FILL, true);
        } else if (col.colType === "restock") {
          const qty = qtyByKey[col.key];
          if (qty) {
            dataCell(c, qty, GREEN_FILL);
            running += qty;
          } else {
            dataCell(c, null, null);
          }
        } else if (col.colType === "outbound") {
          const qty = qtyByKey[col.key];
          if (qty) {
            dataCell(c, -qty, RED_FILL);
            running -= qty;
          } else {
            dataCell(c, null, null);
          }
        } else if (col.colType === "total") {
          dataCell(c, running, TOTAL_FILL, true);
        }
      }

      rowIdx++;
    }

    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

    // Warehouse label for filename
    let whName = "All";
    if (warehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: Number(warehouseId) } });
      if (wh) whName = wh.name.replace(/\s+/g, "_");
    }
    const filename = `Rolling_Totals_${whName}_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Rolling totals report error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

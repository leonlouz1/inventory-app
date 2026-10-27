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

// GET /api/reports/rolling-totals?warehouseId=X&skus=A,B&categories=X,Y
router.get("/rolling-totals", async (req, res) => {
  try {
    const { warehouseId, skus, sku } = req.query;
    const whFilter = warehouseId ? { warehouseId: Number(warehouseId) } : {};
    // support ?skus=SKU1,SKU2 (multi) or legacy ?sku=X (single)
    const skuList = skus ? skus.split(",").map((s) => s.trim()).filter(Boolean)
      : sku ? [sku] : [];
    // ?categories=Luggage,__none__ — "__none__" means products with no category
    const catList = req.query.categories ? req.query.categories.split(",").map((c) => c.trim()).filter(Boolean) : [];
    const named = catList.filter((c) => c !== "__none__");
    const categoryWhere = catList.length === 0 ? {}
      : { OR: [...(named.length ? [{ category: { in: named } }] : []), ...(catList.includes("__none__") ? [{ category: null }] : [])] };
    const productWhere = { ...(skuList.length > 0 && { sku: { in: skuList } }), ...categoryWhere };
    const skuWhere = Object.keys(productWhere).length > 0 ? { product: productWhere } : {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Current on-hand stock per SKU
    const stockRows = await prisma.warehouseStock.findMany({
      where: { ...whFilter, ...skuWhere },
      include: { product: true },
    });
    const currentStock = {};
    const skuNames = {};
    const skuBrands = {};
    for (const row of stockRows) {
      const s = row.product.sku;
      currentStock[s] = (currentStock[s] || 0) + row.onHand;
      skuNames[s] = row.product.name;
      skuBrands[s] = row.product.brand;
    }

    const { PENDING_STATUSES } = require("../constants/orderStatuses");

    // Restocks — future/pending (green, inbound positive)
    const restocks = await prisma.restock.findMany({
      where: { ...whFilter, ...skuWhere, status: { notIn: ["DRAFT", "RECEIVED"] } },
      include: { product: true },
      orderBy: { expectedDate: "asc" },
    });

    // Order lines — active (not shipped/cancelled), all dates including past-due
    const orderLines = await prisma.orderLine.findMany({
      where: {
        ...whFilter,
        ...skuWhere,
        order: { status: { in: PENDING_STATUSES } },
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
      skuBrands[s] = r.product.brand;
      const d = dateStr(r.expectedDate);
      const label = r.supplier ? `Restock\n${r.supplier}` : `Restock\n${d}`;
      const key = `restock|||${d}|||${label}`;
      skuEvents[s].push({ date: d, kind: "restock", qty: r.quantity, label, key });
    }

    for (const l of orderLines) {
      const s = l.product.sku;
      skuNames[s] = l.product.name;
      skuBrands[s] = l.product.brand;
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

    headerCell(1, 3, "Brand", HEADER_FILL);
    ws.getCell(1, 3).font = { bold: true, name: "Arial", size: 9, color: { argb: "FFFFFFFF" } };
    ws.getColumn(3).width = 16;

    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const c = ci + 4;
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
      // Opening balance = current on-hand; future events project forward from here
      const opening = currentStock[s] || 0;

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

      // SKU, name and brand left-aligned
      const skuCell = dataCell(1, s, null, true);
      skuCell.alignment = { vertical: "middle", horizontal: "left" };
      const nameCell = dataCell(2, skuNames[s] || "", null, false);
      nameCell.alignment = { vertical: "middle", horizontal: "left" };
      const brandCell = dataCell(3, skuBrands[s] || "", null, false);
      brandCell.alignment = { vertical: "middle", horizontal: "left" };

      let running = opening;

      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const c = ci + 4;

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

    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];

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

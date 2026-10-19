// Packing lists are built with ExcelJS (loaded on demand) because it can save
// print settings: each sheet prints landscape, fit to one page wide, with the
// column header row repeated on every page.

// Default case size used to convert unit quantities into cases on the
// packing list. We don't track real case-pack data per SKU yet, so this is
// a flat conversion factor applied to every line.
export const UNITS_PER_CASE = 24;

// header, width (characters), alignment; wrap = long text wraps instead of widening the page
const COLUMNS = [
  { header: "SKU", width: 12 },
  { header: "Product", width: 34, wrap: true },
  { header: "Color", width: 12, wrap: true },
  { header: "Qty (Units)", width: 9, align: "right" },
  { header: `Cases (${UNITS_PER_CASE}/case)`, width: 9, align: "right" },
  { header: "Container #", width: 14, wrap: true },
  { header: "Carton Marking", width: 18, wrap: true },
  { header: "PO #", width: 13, wrap: true },
];

const BORDER = { style: "thin", color: { argb: "FFBFBFBF" } };
const CELL_BORDER = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

function lineRow(line, poNumber) {
  return [
    line.sku,
    line.productName,
    line.color || "",
    line.quantity,
    Math.round((line.quantity / UNITS_PER_CASE) * 100) / 100,
    line.containerNumber || "",
    line.cartonMarking || "",
    poNumber,
  ];
}

function addSheet(wb, { name, info, lines }) {
  const ws = wb.addWorksheet(name, {
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // as many pages tall as needed
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: "Page &P of &N" },
  });
  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const title = ws.addRow(["Packing List"]);
  title.font = { bold: true, size: 14 };
  for (const [label, value] of info) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    // Long values (e.g. several PO #s) span the rest of the row and wrap
    ws.mergeCells(row.number, 2, row.number, COLUMNS.length);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
  ws.addRow([]);

  const header = ws.addRow(COLUMNS.map((c) => c.header));
  header.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: COLUMNS[col - 1].align || "left" };
    cell.border = CELL_BORDER;
  });
  ws.pageSetup.printTitlesRow = `${header.number}:${header.number}`;

  for (const values of lines) {
    const row = ws.addRow(values);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const c = COLUMNS[col - 1];
      if (!c) return;
      cell.alignment = { wrapText: !!c.wrap, vertical: "top", horizontal: c.align || "left" };
      cell.border = CELL_BORDER;
    });
  }
}

async function writeWorkbook(sheets, filename) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  sheets.forEach((sheet) => addSheet(wb, sheet));
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Excel tab names: max 31 chars, no : \ / ? * [ ]
function tabName(name) {
  return String(name).replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Order";
}

function orderSheet(name, order) {
  return {
    name,
    info: [
      ["Order #", order.orderNumber],
      ["Customer", order.customer],
      ["Customer PO #", order.customerPo || ""],
      ["Order Date", order.orderDate],
    ],
    // PO # is left blank — filled in by hand after export, since each line
    // could ship under a different PO.
    lines: order.lines.map((line) => lineRow(line, "")),
  };
}

export function downloadPackingList(order) {
  return writeWorkbook([orderSheet("Packing List", order)], `packing_list_${order.orderNumber}.xlsx`);
}

// One packing list covering every order on a shipment; each line carries its
// order's customer PO #.
export function downloadShipmentPackingList(shipment, orders) {
  const unique = (values) => [...new Set(values.filter(Boolean))].join(", ");
  const sheet = {
    name: "Packing List",
    info: [
      ["Shipment #", shipment.shipmentNumber],
      ["Pickup Date", shipment.pickupDate ? shipment.pickupDate.slice(0, 10) : ""],
      ["Carrier", shipment.carrier || ""],
      ["Customer", unique(orders.map((o) => o.customer))],
      ["Orders", orders.map((o) => o.orderNumber).join(", ")],
      ["Customer PO #s", unique(orders.map((o) => o.customerPo))],
    ],
    lines: orders.flatMap((order) => order.lines.map((line) => lineRow(line, order.customerPo || ""))),
  };
  return writeWorkbook([sheet], `packing_list_${shipment.shipmentNumber}.xlsx`);
}

// One file for the shipment with a separate tab per order, each laid out like
// the order packing list on the Orders page.
export function downloadShipmentPackingListPerOrder(shipment, orders) {
  const used = new Set();
  const sheets = orders.map((order) => {
    let name = tabName(order.orderNumber);
    for (let n = 2; used.has(name); n++) name = tabName(`${order.orderNumber} (${n})`);
    used.add(name);
    return orderSheet(name, order);
  });
  return writeWorkbook(sheets, `packing_lists_${shipment.shipmentNumber}.xlsx`);
}

import * as XLSX from "xlsx";

// Default case size used to convert unit quantities into cases on the
// packing list. We don't track real case-pack data per SKU yet, so this is
// a flat conversion factor applied to every line.
export const UNITS_PER_CASE = 24;

const LINE_HEADER = ["SKU", "Product", "Color", "Qty (Units)", "Cases (24/case)", "Container #", "Carton Marking", "PO #"];
const LINE_COL_WIDTHS = [14, 28, 14, 12, 16, 14, 18, 14].map((wch) => ({ wch }));

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

// sheets: [{ name, rows }] -> one workbook with a tab per entry
function writeWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = LINE_COL_WIDTHS;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}

// Excel tab names: max 31 chars, no : \ / ? * [ ]
function tabName(name) {
  return String(name).replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Order";
}

function orderSheetRows(order) {
  const headerRows = [
    ["Packing List"],
    ["Order #", order.orderNumber],
    ["Customer", order.customer],
    ["Customer PO #", order.customerPo || ""],
    ["Order Date", order.orderDate],
    [],
    LINE_HEADER,
  ];

  // PO # is left blank — filled in by hand after export, since each line
  // could ship under a different PO.
  const lineRows = order.lines.map((line) => lineRow(line, ""));
  return [...headerRows, ...lineRows];
}

export function downloadPackingList(order) {
  writeWorkbook([{ name: "Packing List", rows: orderSheetRows(order) }], `packing_list_${order.orderNumber}.xlsx`);
}

// One packing list covering every order on a shipment; each line carries its
// order's customer PO #.
export function downloadShipmentPackingList(shipment, orders) {
  const unique = (values) => [...new Set(values.filter(Boolean))].join(", ");
  const headerRows = [
    ["Packing List"],
    ["Shipment #", shipment.shipmentNumber],
    ["Pickup Date", shipment.pickupDate ? shipment.pickupDate.slice(0, 10) : ""],
    ["Carrier", shipment.carrier || ""],
    ["Customer", unique(orders.map((o) => o.customer))],
    ["Orders", orders.map((o) => o.orderNumber).join(", ")],
    ["Customer PO #s", unique(orders.map((o) => o.customerPo))],
    [],
    LINE_HEADER,
  ];

  const lineRows = orders.flatMap((order) => order.lines.map((line) => lineRow(line, order.customerPo || "")));

  writeWorkbook([{ name: "Packing List", rows: [...headerRows, ...lineRows] }], `packing_list_${shipment.shipmentNumber}.xlsx`);
}

// One file for the shipment with a separate tab per order, each laid out like
// the order packing list on the Orders page.
export function downloadShipmentPackingListPerOrder(shipment, orders) {
  const used = new Set();
  const sheets = orders.map((order) => {
    let name = tabName(order.orderNumber);
    for (let n = 2; used.has(name); n++) name = tabName(`${order.orderNumber} (${n})`);
    used.add(name);
    return { name, rows: orderSheetRows(order) };
  });
  writeWorkbook(sheets, `packing_lists_${shipment.shipmentNumber}.xlsx`);
}

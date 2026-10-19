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

function writeSheet(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = LINE_COL_WIDTHS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Packing List");
  XLSX.writeFile(wb, filename);
}

export function downloadPackingList(order) {
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

  writeSheet([...headerRows, ...lineRows], `packing_list_${order.orderNumber}.xlsx`);
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

  writeSheet([...headerRows, ...lineRows], `packing_list_${shipment.shipmentNumber}.xlsx`);
}

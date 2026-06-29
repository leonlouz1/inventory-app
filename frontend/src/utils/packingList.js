import * as XLSX from "xlsx";

// Default case size used to convert unit quantities into cases on the
// packing list. We don't track real case-pack data per SKU yet, so this is
// a flat conversion factor applied to every line.
export const UNITS_PER_CASE = 24;

export function downloadPackingList(order) {
  const headerRows = [
    ["Packing List"],
    ["Order #", order.orderNumber],
    ["Customer", order.customer],
    ["Customer PO #", order.customerPo || ""],
    ["Order Date", order.orderDate],
    [],
    ["SKU", "Product", "Warehouse", "Qty (Units)", "Cases (24/case)", "Ship Date", "Container #", "PO #"],
  ];

  // Container # and PO # are left blank — filled in by hand after export,
  // since each line could ship in a different container under a different PO.
  const lineRows = order.lines.map((line) => [
    line.sku,
    line.productName,
    line.warehouseName || "Unassigned",
    line.quantity,
    Math.round((line.quantity / UNITS_PER_CASE) * 100) / 100,
    line.shipDate,
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...lineRows]);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Packing List");
  XLSX.writeFile(wb, `packing_list_${order.orderNumber}.xlsx`);
}

import * as XLSX from "xlsx";

export async function downloadInventoryReport(products) {
  const today = new Date().toISOString().slice(0, 10);

  const headerRow = [
    "SKU",
    "Product",
    "Current Stock",
    "Committed Orders",
    "Incoming Restocks",
    "Net Available",
  ];

  const dataRows = [...products]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((p) => {
      const onHand = p.totalOnHand ?? 0;
      const committed = p.pendingQty ?? 0;
      const incoming = p.incomingQty ?? 0;
      const net = onHand - committed + incoming;
      return [p.sku, p.name, onHand, committed, incoming, net];
    });

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
  XLSX.writeFile(wb, `inventory_report_${today}.xlsx`);
}

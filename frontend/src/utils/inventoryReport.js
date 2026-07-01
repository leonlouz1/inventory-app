import * as XLSX from "xlsx";
import { restocksApi } from "../api/inventory";

export async function downloadInventoryReport(products) {
  const today = new Date().toISOString().slice(0, 10);

  const allRestocks = await restocksApi.list();
  const incomingBySkU = {};
  for (const r of allRestocks) {
    if (r.expectedDate >= today) {
      incomingBySkU[r.sku] = (incomingBySkU[r.sku] || 0) + r.quantity;
    }
  }

  const headerRow = [
    "SKU",
    "Product",
    "Current Stock",
    "Committed (Future Orders)",
    "Remaining",
    "Short",
    "Incoming Restocks",
    "Available After Restocks",
  ];

  const dataRows = [...products]
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((p) => {
      const remaining = p.availableToSell;
      const short = remaining < 0 ? Math.abs(remaining) : 0;
      const incoming = incomingBySkU[p.sku] || 0;
      const availableAfter = remaining + incoming;
      return [
        p.sku,
        p.name,
        p.totalOnHand,
        p.pendingQty,
        remaining,
        short,
        incoming,
        availableAfter,
      ];
    });

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
    { wch: 18 },
    { wch: 24 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory Report");
  XLSX.writeFile(wb, `inventory_report_${today}.xlsx`);
}

import * as XLSX from "xlsx";

// SKUs with stock to sell: one row each, with a quantity column per warehouse
export function atsLinesheetRows(products, warehouses) {
  const header = ["SKU", "Brand", "Case Pack", "QTY Available to Sell", ...warehouses.map((w) => `QTY ${w.name}`)];
  const rows = products
    .filter((p) => p.availableToSell > 0)
    .sort((a, b) => a.sku.localeCompare(b.sku))
    .map((p) => [
      p.sku,
      p.brand || "",
      p.casePack ?? "",
      p.availableToSell,
      ...warehouses.map((w) => p.stockByWarehouse?.[w.id] ?? 0),
    ]);
  return [header, ...rows];
}

export function downloadAtsLinesheet(products, warehouses) {
  const today = new Date().toISOString().slice(0, 10);
  const aoa = atsLinesheetRows(products, warehouses);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, ...warehouses.map((w) => ({ wch: Math.max(10, w.name.length + 5) }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ATS Linesheet");
  XLSX.writeFile(wb, `ats_linesheet_${today}.xlsx`);
  return aoa.length - 1;
}

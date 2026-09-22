import * as XLSX from "xlsx";

export function downloadAvailableToSellReport(rows, catalogBaseUrl) {
  const today = new Date().toISOString().slice(0, 10);

  const headerRow = [
    "SKU", "Product", "Brand", "UPC", "Case Pack",
    "Wholesale Price", "Retail Price",
    "Available Qty", "Incoming",
    "Product Page",
  ];

  const dataRows = rows
    .filter((r) => r.available > 0)
    .map((r) => [
      r.sku,
      r.name,
      r.brand || "",
      r.upc || "",
      r.casePack,
      r.wholesalePrice ?? "",
      r.retailPrice ?? "",
      r.available,
      r.incoming,
      catalogBaseUrl ? `${catalogBaseUrl}/${r.sku}` : "",
    ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws["!cols"] = [
    { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
    { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Available to Sell");
  XLSX.writeFile(wb, `available_to_sell_${today}.xlsx`);
}

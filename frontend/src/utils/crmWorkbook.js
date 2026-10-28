import * as XLSX from "xlsx";

const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The header row is the first one (of the top few) that names the company and a person
function findHeaderRow(grid) {
  for (let i = 0; i < Math.min(grid.length, 6); i++) {
    const cells = grid[i].map((c) => String(c ?? "").trim().toLowerCase());
    if (cells.some((c) => ["company", "retailer"].includes(c)) && cells.some((c) => ["buyer name", "name"].includes(c))) {
      return i;
    }
  }
  return -1;
}

// Reads an Excel CRM file into tabs of rows keyed by header. Tabs without a
// Company/Retailer + Name header (dashboards, account grids) are left out.
export async function readCrmWorkbook(data) {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const tabs = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, blankrows: false });
    const h = findHeaderRow(grid);
    if (h < 0) continue;
    const headers = grid[h].map((c, i) => (c === null || String(c).trim() === "" ? null : `${String(c).trim()}${grid[h].slice(0, i).some((p) => String(p ?? "").trim() === String(c).trim()) ? ` (${i})` : ""}`));
    const rows = [];
    for (const r of grid.slice(h + 1)) {
      const row = {};
      headers.forEach((key, i) => {
        if (!key) return;
        const v = r[i];
        row[key] = v instanceof Date ? localDay(v) : v;
      });
      const company = row.Company ?? row.Retailer;
      const person = row["Buyer Name"] ?? row.Name;
      if (company && person) rows.push(row);
    }
    tabs.push({ name, rows });
  }
  return tabs;
}

// "PET NOTES" → "Pet", "Storage notes" → "Storage"
export function guessCategory(tabName, categories) {
  const t = tabName.toLowerCase();
  return categories.find((c) => t.includes(c.toLowerCase())) || null;
}

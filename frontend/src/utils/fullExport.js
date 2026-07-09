import * as XLSX from "xlsx";
import { productsApi, ordersApi, restocksApi, warehousesApi, shipmentsApi, crmApi } from "../api/inventory";

function saveWorkbook(wb, filename) {
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function addSheet(wb, name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export async function downloadFullExport() {
  const [products, orders, restocks, warehouses, shipments, retailers, contacts, activity, sent] =
    await Promise.all([
      productsApi.list(),
      ordersApi.list(),
      restocksApi.list(),
      warehousesApi.list(),
      shipmentsApi.list(),
      crmApi.listRetailers(),
      crmApi.listContacts(),
      crmApi.listActivity(),
      crmApi.listSent(),
    ]);

  const wb = XLSX.utils.book_new();

  // ── Products & Stock ──────────────────────────────────────────────────────
  const warehouseNames = warehouses.map((w) => w.name);
  addSheet(
    wb,
    "Products",
    products.map((p) => {
      const row = {
        SKU: p.sku,
        Name: p.name,
        Brand: p.brand || "",
        Category: p.category || "",
        "Reorder Point": p.reorderPoint,
        "Reorder Qty": p.reorderQty,
        "Lead Time (days)": p.leadTimeDays,
        "Pending Orders": p.pendingQty,
        "Available to Sell": p.availableToSell,
      };
      for (const wName of warehouseNames) {
        const wh = warehouses.find((w) => w.name === wName);
        row[`Stock — ${wName}`] = wh ? (p.stockByWarehouse[wh.id] ?? 0) : 0;
      }
      return row;
    })
  );

  // ── Orders ────────────────────────────────────────────────────────────────
  addSheet(
    wb,
    "Orders",
    orders.flatMap((o) =>
      o.lines.map((l) => ({
        "Order #": o.orderNumber,
        Customer: o.customer,
        "Customer PO #": o.customerPo || "",
        "Order Date": o.orderDate,
        Status: o.status,
        SKU: l.sku,
        Product: l.productName,
        Warehouse: l.warehouseName || "",
        Quantity: l.quantity,
        "Ship Date": l.shipDate,
      }))
    )
  );

  // ── Restocks ──────────────────────────────────────────────────────────────
  addSheet(
    wb,
    "Restocks",
    restocks.map((r) => ({
      SKU: r.sku,
      Product: r.productName,
      Warehouse: r.warehouseName,
      Quantity: r.quantity,
      "Expected Date": r.expectedDate,
      Supplier: r.supplier || "",
      "Received At": r.receivedAt || "",
      "Linked Order": r.linkedOrderNumber || "",
      Notes: r.notes || "",
    }))
  );

  // ── Shipments ─────────────────────────────────────────────────────────────
  addSheet(
    wb,
    "Shipments",
    shipments.flatMap((s) =>
      s.orders.length
        ? s.orders.map((o) => ({
            "Shipment #": s.shipmentNumber,
            "Pickup Date": new Date(s.pickupDate).toLocaleString(),
            Carrier: s.carrier || "",
            "CS #": s.csNumber || "",
            Status: s.status,
            Warehouse: s.warehouseName || "",
            "Order #": o.orderNumber,
            Customer: o.customer,
          }))
        : [
            {
              "Shipment #": s.shipmentNumber,
              "Pickup Date": new Date(s.pickupDate).toLocaleString(),
              Carrier: s.carrier || "",
              "CS #": s.csNumber || "",
              Status: s.status,
              Warehouse: s.warehouseName || "",
              "Order #": "",
              Customer: "",
            },
          ]
    )
  );

  // ── Warehouses ────────────────────────────────────────────────────────────
  addSheet(
    wb,
    "Warehouses",
    warehouses.map((w) => ({
      Name: w.name,
      Location: w.location || "",
    }))
  );

  // ── CRM Retailers ─────────────────────────────────────────────────────────
  addSheet(
    wb,
    "CRM Retailers",
    retailers.flatMap((r) =>
      r.categories.length
        ? r.categories.map((c) => ({
            Retailer: r.name,
            Type: r.type || "",
            Priority: r.priority,
            Category: c.category,
            Buyer: c.buyerName || "",
            Status: c.status,
            Notes: r.notes || "",
          }))
        : [{ Retailer: r.name, Type: r.type || "", Priority: r.priority, Category: "", Buyer: "", Status: "", Notes: r.notes || "" }]
    )
  );

  // ── CRM Contacts ──────────────────────────────────────────────────────────
  addSheet(
    wb,
    "CRM Contacts",
    contacts.map((c) => ({
      Retailer: c.retailerName,
      Name: c.name,
      Title: c.title || "",
      Category: c.category || "",
      Email: c.email || "",
      "Direct #": c.directPhone || "",
      "Mobile #": c.mobilePhone || "",
      "HQ #": c.hqPhone || "",
      Notes: c.notes || "",
    }))
  );

  // ── Activity Log ──────────────────────────────────────────────────────────
  addSheet(
    wb,
    "Activity Log",
    activity.map((a) => ({
      Date: a.date,
      Retailer: a.retailerName,
      Category: a.category || "",
      Rep: a.rep || "",
      "Action Taken": a.actionTaken,
      Notes: a.notes || "",
      "Next Step": a.nextStep || "",
      "Next Step Date": a.nextStepDate || "",
      Done: a.done ? "Yes" : "No",
    }))
  );

  // ── Sent Tracker ──────────────────────────────────────────────────────────
  addSheet(
    wb,
    "Sent Tracker",
    sent.map((s) => ({
      "Date Sent": s.dateSent,
      Retailer: s.retailerName,
      Category: s.category || "",
      Buyer: s.buyerName || "",
      "Item Sent": s.itemSent,
      Notes: s.notes || "",
      Response: s.responseReceived || "",
      "Follow-up Date": s.followUpDate || "",
      Done: s.done ? "Yes" : "No",
    }))
  );

  const date = new Date().toISOString().slice(0, 10);
  saveWorkbook(wb, `inventory_crm_backup_${date}.xlsx`);
}

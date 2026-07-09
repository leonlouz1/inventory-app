const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");

const router = Router();
const prisma = new PrismaClient();

// POST /api/import
// Accepts pre-parsed JSON (frontend reads the Excel with SheetJS and sends JSON).
// Upserts/skips existing records — safe to run on a live DB.
router.post("/", async (req, res) => {
  const {
    warehouses = [],
    products = [],
    retailers = [],
    contacts = [],
    orders = [],
    restocks = [],
    shipments = [],
    activity = [],
    sent = [],
  } = req.body;

  const summary = {
    warehouses: { created: 0, updated: 0 },
    products: { created: 0, updated: 0 },
    stock: { upserted: 0 },
    retailers: { created: 0, updated: 0 },
    contacts: { created: 0, skipped: 0 },
    orders: { created: 0, skipped: 0 },
    restocks: { created: 0, skipped: 0 },
    shipments: { created: 0, skipped: 0 },
    activity: { created: 0 },
    sent: { created: 0 },
  };

  // ── 1. Warehouses ─────────────────────────────────────────────────────────
  const warehouseMap = {};
  for (const w of warehouses) {
    if (!w.name) continue;
    const existing = await prisma.warehouse.findUnique({ where: { name: w.name } });
    if (existing) {
      warehouseMap[w.name] = existing.id;
      summary.warehouses.updated++;
    } else {
      const created = await prisma.warehouse.create({ data: { name: w.name, location: w.location || null } });
      warehouseMap[w.name] = created.id;
      summary.warehouses.created++;
    }
  }

  // ── 2. Products + Stock ───────────────────────────────────────────────────
  const productMap = {};
  for (const p of products) {
    if (!p.sku) continue;
    const data = {
      name: p.name || p.sku,
      brand: p.brand || null,
      category: p.category || null,
      reorderPoint: Number(p.reorderPoint) || 0,
      reorderQty: Number(p.reorderQty) || 0,
      leadTimeDays: Number(p.leadTimeDays) || 45,
    };
    const before = await prisma.product.findUnique({ where: { sku: p.sku } });
    const result = await prisma.product.upsert({
      where: { sku: p.sku },
      update: data,
      create: { sku: p.sku, ...data },
    });
    productMap[p.sku] = result.id;
    if (before) { summary.products.updated++; } else { summary.products.created++; }

    if (p.stock && typeof p.stock === "object") {
      for (const [whName, qty] of Object.entries(p.stock)) {
        const whId = warehouseMap[whName];
        if (!whId || isNaN(Number(qty))) continue;
        await prisma.warehouseStock.upsert({
          where: { productId_warehouseId: { productId: result.id, warehouseId: whId } },
          update: { onHand: Number(qty) },
          create: { productId: result.id, warehouseId: whId, onHand: Number(qty) },
        });
        summary.stock.upserted++;
      }
    }
  }

  // ── 3. CRM Retailers ──────────────────────────────────────────────────────
  const retailerMap = {};
  for (const r of retailers) {
    if (!r.name) continue;
    const data = {
      type: r.type || null,
      priority: r.priority || "1 - Low",
      notes: r.notes || null,
    };
    const existing = await prisma.retailer.findUnique({ where: { name: r.name } });
    let retailerId;
    if (existing) {
      await prisma.retailer.update({ where: { id: existing.id }, data });
      retailerId = existing.id;
      summary.retailers.updated++;
    } else {
      const created = await prisma.retailer.create({ data: { name: r.name, ...data } });
      retailerId = created.id;
      summary.retailers.created++;
    }
    retailerMap[r.name] = retailerId;

    for (const cat of (r.categories || [])) {
      if (!cat.category) continue;
      await prisma.retailerCategory.upsert({
        where: { retailerId_category: { retailerId, category: cat.category } },
        update: { buyerName: cat.buyerName || null, status: cat.status || "Not Contacted" },
        create: { retailerId, category: cat.category, buyerName: cat.buyerName || null, status: cat.status || "Not Contacted" },
      });
    }
  }

  // ── 4. CRM Contacts ───────────────────────────────────────────────────────
  for (const c of contacts) {
    const retailerId = retailerMap[c.retailerName];
    if (!retailerId || !c.name) { summary.contacts.skipped++; continue; }
    const existing = await prisma.crmContact.findFirst({ where: { retailerId, name: c.name } });
    if (existing) { summary.contacts.skipped++; continue; }
    await prisma.crmContact.create({
      data: {
        retailerId,
        name: c.name,
        title: c.title || null,
        category: c.category || null,
        email: c.email || null,
        directPhone: c.directPhone || null,
        mobilePhone: c.mobilePhone || null,
        hqPhone: c.hqPhone || null,
        notes: c.notes || null,
      },
    });
    summary.contacts.created++;
  }

  // ── 5. Orders ─────────────────────────────────────────────────────────────
  const orderMap = {};
  for (const o of orders) {
    if (!o.orderNumber) continue;
    const existing = await prisma.order.findUnique({ where: { orderNumber: o.orderNumber } });
    if (existing) {
      orderMap[o.orderNumber] = existing.id;
      summary.orders.skipped++;
      continue;
    }
    const validLines = (o.lines || []).filter((l) => productMap[l.sku] && l.shipDate);
    const order = await prisma.order.create({
      data: {
        orderNumber: o.orderNumber,
        customer: o.customer || "Unknown",
        customerPo: o.customerPo || null,
        orderDate: new Date(o.orderDate),
        status: o.status || "CONFIRMED",
        notes: o.notes || null,
        lines: {
          create: validLines.map((l) => ({
            productId: productMap[l.sku],
            warehouseId: l.warehouseName ? warehouseMap[l.warehouseName] || null : null,
            quantity: Number(l.quantity) || 1,
            shipDate: new Date(l.shipDate),
          })),
        },
      },
    });
    orderMap[o.orderNumber] = order.id;
    summary.orders.created++;
  }

  // ── 6. Restocks ───────────────────────────────────────────────────────────
  for (const r of restocks) {
    const productId = productMap[r.sku];
    const warehouseId = warehouseMap[r.warehouseName];
    if (!productId || !warehouseId || !r.expectedDate) { summary.restocks.skipped++; continue; }
    const existing = await prisma.restock.findFirst({
      where: { productId, warehouseId, expectedDate: new Date(r.expectedDate) },
    });
    if (existing) { summary.restocks.skipped++; continue; }
    await prisma.restock.create({
      data: {
        productId,
        warehouseId,
        quantity: Number(r.quantity) || 0,
        expectedDate: new Date(r.expectedDate),
        supplier: r.supplier || null,
        receivedAt: r.receivedAt ? new Date(r.receivedAt) : null,
        notes: r.notes || null,
        linkedOrderId: r.linkedOrderNumber ? orderMap[r.linkedOrderNumber] || null : null,
      },
    });
    summary.restocks.created++;
  }

  // ── 7. Shipments ──────────────────────────────────────────────────────────
  for (const s of shipments) {
    if (!s.shipmentNumber) continue;
    const existing = await prisma.shipment.findUnique({ where: { shipmentNumber: s.shipmentNumber } });
    if (existing) { summary.shipments.skipped++; continue; }
    const warehouseId = s.warehouseName ? warehouseMap[s.warehouseName] || null : null;
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber: s.shipmentNumber,
        pickupDate: new Date(s.pickupDate),
        carrier: s.carrier || null,
        csNumber: s.csNumber || null,
        status: s.status || "SCHEDULED",
        warehouseId,
      },
    });
    for (const orderNum of (s.orderNumbers || [])) {
      const orderId = orderMap[orderNum];
      if (orderId) {
        await prisma.order.update({ where: { id: orderId }, data: { shipmentId: shipment.id } });
      }
    }
    summary.shipments.created++;
  }

  // ── 8. Activity Log ───────────────────────────────────────────────────────
  for (const a of activity) {
    const retailerId = retailerMap[a.retailerName];
    if (!retailerId || !a.date || !a.actionTaken) continue;
    await prisma.activityLog.create({
      data: {
        retailerId,
        category: a.category || null,
        rep: a.rep || null,
        date: new Date(a.date),
        actionTaken: a.actionTaken,
        notes: a.notes || null,
        nextStep: a.nextStep || null,
        nextStepDate: a.nextStepDate ? new Date(a.nextStepDate) : null,
        done: a.done === true || a.done === "Yes",
      },
    });
    summary.activity.created++;
  }

  // ── 9. Sent Tracker ───────────────────────────────────────────────────────
  for (const s of sent) {
    const retailerId = retailerMap[s.retailerName];
    if (!retailerId || !s.dateSent || !s.itemSent) continue;
    await prisma.sentItem.create({
      data: {
        retailerId,
        category: s.category || null,
        buyerName: s.buyerName || null,
        dateSent: new Date(s.dateSent),
        itemSent: s.itemSent,
        notes: s.notes || null,
        responseReceived: s.responseReceived || null,
        followUpDate: s.followUpDate ? new Date(s.followUpDate) : null,
        done: s.done === true || s.done === "Yes",
      },
    });
    summary.sent.created++;
  }

  res.json({ ok: true, summary });
});

module.exports = router;

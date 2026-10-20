const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { buildSkuTimeline } = require("../services/timeline");
const { applyPendingRestocks } = require("../services/autoReceive");
const { PENDING_STATUSES } = require("../constants/orderStatuses");
const { defaultCasePack } = require("../constants/categories");
const { systemUpcFor } = require("../services/upcProducts");

const router = express.Router();

function cleanCasePack(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Category fields live in attributes; Color is also kept in the product's own
// color column so packing lists and UPC codes read the same value.
function attributeData(attributes) {
  if (!attributes || typeof attributes !== "object") return {};
  return {
    attributes,
    ...(attributes.color !== undefined && { color: attributes.color || null }),
  };
}

// GET /api/products — list all products with on_hand per warehouse
router.get(
  "/",
  asyncHandler(async (req, res) => {
    await applyPendingRestocks();
    // Past ship dates are ignored, per the projection scope business rule
    // (same convention as alerts.js): a line still counts as "pending" — not
    // yet shipped — through and including today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [products, warehouses, pendingByProduct, incomingByProduct] = await Promise.all([
      prisma.product.findMany({
        orderBy: { sku: "asc" },
        include: { stock: true },
      }),
      prisma.warehouse.findMany({ orderBy: { id: "asc" } }),
      // Only Confirmed/Routed lines count as pending — Shipped is already
      // reflected directly in on-hand, Draft/Cancelled never counted.
      prisma.orderLine.groupBy({
        by: ["productId"],
        where: { order: { status: { in: PENDING_STATUSES } } },
        _sum: { quantity: true },
      }),
      // Incoming = restocks not yet received (any non-RECEIVED status)
      prisma.restock.groupBy({
        by: ["productId"],
        where: { status: { notIn: ["DRAFT", "RECEIVED"] } },
        _sum: { quantity: true },
      }),
    ]);

    const pendingQtyByProductId = new Map(
      pendingByProduct.map((row) => [row.productId, row._sum.quantity ?? 0])
    );
    const incomingQtyByProductId = new Map(
      incomingByProduct.map((row) => [row.productId, row._sum.quantity ?? 0])
    );

    const result = products.map((product) => {
      const stockByWarehouse = {};
      let totalOnHand = 0;
      for (const warehouse of warehouses) {
        const row = product.stock.find((s) => s.warehouseId === warehouse.id);
        const onHand = row ? row.onHand : 0;
        stockByWarehouse[warehouse.id] = onHand;
        totalOnHand += onHand;
      }
      const pendingQty = pendingQtyByProductId.get(product.id) ?? 0;
      const incomingQty = incomingQtyByProductId.get(product.id) ?? 0;
      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category: product.category,
        leadTimeDays: product.leadTimeDays,
        color: product.color,
        casePack: product.casePack,
        imageUrl: product.imageUrl,
        attributes: product.attributes ?? {},
        stockByWarehouse,
        totalOnHand,
        pendingQty,
        incomingQty,
        availableToSell: totalOnHand - pendingQty,
        shadowParentId: product.shadowParentId ?? null,
      };
    });

    // Shadow SKUs: tag each side, and give parents a total that includes their shadows
    const byId = new Map(result.map((p) => [p.id, p]));
    for (const p of result) {
      p.shadowParentSku = p.shadowParentId ? byId.get(p.shadowParentId)?.sku ?? null : null;
      p.shadows = [];
    }
    for (const p of result) {
      const parent = p.shadowParentId && byId.get(p.shadowParentId);
      if (parent) parent.shadows.push({ id: p.id, sku: p.sku, totalOnHand: p.totalOnHand });
    }
    for (const p of result) {
      p.totalWithShadows = p.shadows.length ? p.totalOnHand + p.shadows.reduce((s, x) => s + x.totalOnHand, 0) : null;
    }

    // Designers see product details only, no stock or order quantities.
    if (req.role === "designer") {
      return res.json(result.map((p) => ({
        id: p.id, sku: p.sku, name: p.name, brand: p.brand, category: p.category, leadTimeDays: p.leadTimeDays,
        casePack: p.casePack,
        imageUrl: p.imageUrl,
        attributes: p.attributes,
        shadowParentId: p.shadowParentId,
        shadowParentSku: p.shadowParentSku,
        shadows: p.shadows.map(({ id, sku }) => ({ id, sku })),
      })));
    }
    res.json(result);
  })
);

// POST /api/products — create product, with optional initial on-hand per warehouse
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { sku: rawSku, name, brand, category, leadTimeDays, attributes } = req.body;
    const casePack = cleanCasePack(req.body.casePack);
    // Designers can create products but not set stock.
    const initialStock = req.role === "designer" ? [] : req.body.initialStock;
    const sku = rawSku ? rawSku.trim().toUpperCase() : rawSku;
    if (!sku || !name) {
      return res.status(400).json({ message: "sku and name are required" });
    }

    const warehouses = await prisma.warehouse.findMany();
    const initialStockByWarehouse = new Map((initialStock || []).map((s) => [s.warehouseId, s.onHand]));

    try {
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            sku,
            name,
            brand: brand ?? null,
            category: category ?? null,
            leadTimeDays: leadTimeDays ?? 45,
            casePack: casePack ?? defaultCasePack(category),
            ...attributeData(attributes),
          },
        });

        await tx.warehouseStock.createMany({
          data: warehouses.map((w) => ({
            productId: created.id,
            warehouseId: w.id,
            onHand: initialStockByWarehouse.get(w.id) ?? 0,
          })),
        });

        return created;
      });

      res.status(201).json(product);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: `SKU "${sku}" already exists` });
      }
      throw err;
    }
  })
);

// GET /api/products/details — every product's editable details, for the
// bulk-edit spreadsheet
router.get(
  "/details",
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({ orderBy: { sku: "asc" } });
    res.json(products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      casePack: p.casePack,
      leadTimeDays: p.leadTimeDays,
      wholesalePrice: p.wholesalePrice != null ? Number(p.wholesalePrice) : null,
      retailPrice: p.retailPrice != null ? Number(p.retailPrice) : null,
      description: p.description,
      imageUrl: p.imageUrl,
      color: p.color,
      attributes: p.attributes ?? {},
    })));
  })
);

// POST /api/products/bulk-update — { updates: [{ sku, name?, brand?, category?,
// casePack?, leadTimeDays?, wholesalePrice?, retailPrice?, description?,
// imageUrl?, attributes? }] }: applies only the fields given, all or nothing.
// Attributes are merged; Color also updates the color column. UPCs aren't touched.
router.post(
  "/bulk-update",
  asyncHandler(async (req, res) => {
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (updates.length === 0) return res.status(400).json({ message: "Nothing to update" });
    const skus = updates.map((u) => String(u.sku));
    const products = await prisma.product.findMany({ where: { sku: { in: skus } } });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const unknown = skus.filter((s) => !bySku.has(s));
    if (unknown.length) return res.status(400).json({ message: `Unknown SKUs: ${unknown.slice(0, 10).join(", ")}` });

    const num = (v, int) => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || (int && !Number.isInteger(n))) throw Object.assign(new Error(`Invalid number "${v}"`), { status: 400 });
      return n;
    };

    try {
      await prisma.$transaction(async (tx) => {
        for (const u of updates) {
          const current = bySku.get(String(u.sku));
          const data = {};
          for (const key of ["name", "brand", "category", "description", "imageUrl"]) {
            if (u[key] !== undefined) data[key] = u[key] === "" ? null : u[key];
          }
          if (data.name === null) delete data.name; // a product always keeps a name
          if (u.casePack !== undefined) data.casePack = num(u.casePack, true) || null;
          if (u.leadTimeDays !== undefined) data.leadTimeDays = num(u.leadTimeDays, true) ?? current.leadTimeDays;
          if (u.wholesalePrice !== undefined) data.wholesalePrice = num(u.wholesalePrice);
          if (u.retailPrice !== undefined) data.retailPrice = num(u.retailPrice);
          if (u.attributes && typeof u.attributes === "object") {
            Object.assign(data, attributeData({ ...(current.attributes ?? {}), ...u.attributes }));
          }
          if (Object.keys(data).length) await tx.product.update({ where: { id: current.id }, data });
        }
      }, { timeout: 60000 });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ message: err.message });
      throw err;
    }
    res.json({ updated: updates.length });
  })
);

// GET /api/products/by-sku/:sku — a product's page: its id plus open orders,
// recent shipments and restocks for that SKU (designers just get the id)
router.get(
  "/by-sku/:sku",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { sku: req.params.sku }, select: { id: true, sku: true } });
    if (!product) return res.status(404).json({ message: `No product with SKU ${req.params.sku}` });
    if (req.role === "designer") return res.json({ id: product.id, sku: product.sku });

    const lineView = (l) => ({
      orderId: l.order.id,
      orderNumber: l.order.orderNumber,
      customer: l.order.customer,
      customerPo: l.order.customerPo,
      status: l.order.status,
      quantity: l.quantity,
      shipDate: l.shipDate.toISOString().slice(0, 10),
      shippedAt: l.order.shippedAt ? l.order.shippedAt.toISOString().slice(0, 10) : null,
      warehouseName: l.warehouse?.name ?? null,
    });
    const [openLines, shippedLines, restocks] = await Promise.all([
      prisma.orderLine.findMany({
        where: { productId: product.id, order: { status: { notIn: ["SHIPPED", "CANCELLED"] } } },
        include: { order: true, warehouse: true },
        orderBy: { shipDate: "asc" },
      }),
      prisma.orderLine.findMany({
        where: { productId: product.id, order: { status: "SHIPPED" } },
        include: { order: true, warehouse: true },
        orderBy: { shipDate: "desc" },
        take: 25,
      }),
      prisma.restock.findMany({
        where: { productId: product.id, status: { not: "RECEIVED" } },
        include: { warehouse: true, container: { select: { containerNumber: true } } },
        orderBy: { expectedDate: "asc" },
      }),
    ]);
    res.json({
      id: product.id,
      sku: product.sku,
      openLines: openLines.map(lineView),
      shippedLines: shippedLines.map(lineView),
      restocks: restocks.map((r) => ({
        id: r.id,
        containerId: r.containerId,
        containerNumber: r.container?.containerNumber ?? null,
        quantity: r.quantity,
        expectedDate: r.expectedDate.toISOString().slice(0, 10),
        status: r.status,
        supplier: r.supplier,
        warehouseName: r.warehouse?.name ?? null,
      })),
    });
  })
);

// GET /api/products/:id/full — everything about one product, for the product
// window shared by Products, Catalog and UPC Codes (no stock for designers)
router.get(
  "/:id/full",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        stock: true,
        shadowParent: { select: { id: true, sku: true } },
        shadows: { select: { id: true, sku: true } },
      },
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    const [assignment, systemUpc] = await Promise.all([
      prisma.upcAssignment.findUnique({ where: { sku: product.sku } }),
      systemUpcFor(prisma, product.sku),
    ]);
    const group = assignment?.groupId ? await prisma.upcGroup.findUnique({ where: { id: assignment.groupId } }) : null;
    const { stock, ...rest } = product;
    res.json({
      ...rest,
      wholesalePrice: product.wholesalePrice != null ? Number(product.wholesalePrice) : null,
      retailPrice: product.retailPrice != null ? Number(product.retailPrice) : null,
      upcLocked: Boolean(systemUpc),
      upc: systemUpc || product.upc,
      upcStatus: assignment ? { inUse: assignment.inUse, groupName: group?.name ?? null } : null,
      ...(req.role !== "designer" && {
        stockByWarehouse: Object.fromEntries(stock.map((s) => [s.warehouseId, s.onHand])),
      }),
    });
  })
);

// PUT /api/products/:id — update any of the product's details, including the
// catalog ones (description, prices, image, UPC). A UPC-system SKU always keeps
// its system UPC.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, brand, category, leadTimeDays, attributes, description, imageUrl } = req.body;
    const casePack = cleanCasePack(req.body.casePack);
    const money = (v) => (v === undefined ? undefined : v === null || v === "" ? null : Number(v));
    const wholesalePrice = money(req.body.wholesalePrice);
    const retailPrice = money(req.body.retailPrice);

    try {
      const current = await prisma.product.findUnique({ where: { id }, select: { sku: true, attributes: true } });
      if (!current) return res.status(404).json({ message: "Product not found" });
      const systemUpc = await systemUpcFor(prisma, current.sku);
      const upc = systemUpc ?? (req.body.upc !== undefined ? req.body.upc || null : undefined);
      const product = await prisma.product.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(brand !== undefined && { brand }),
          ...(category !== undefined && { category }),
          ...(leadTimeDays !== undefined && { leadTimeDays }),
          ...(casePack !== undefined && { casePack }),
          ...(description !== undefined && { description: description || null }),
          ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
          ...(wholesalePrice !== undefined && { wholesalePrice }),
          ...(retailPrice !== undefined && { retailPrice }),
          ...(upc !== undefined && { upc }),
          // Merge so attributes this form didn't show are kept
          ...(attributes && attributeData({ ...(current.attributes ?? {}), ...attributes })),
        },
      });
      res.json(product);
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ message: "Product not found" });
      }
      throw err;
    }
  })
);

// Shadow links are one level deep: a shadow can't have shadows of its own, and
// a product with shadows can't become a shadow. Returns an error message or null.
async function shadowLinkProblem(shadowId, parentId) {
  if (shadowId === parentId) return "A SKU can't be its own shadow";
  const [shadow, parent] = await Promise.all([
    prisma.product.findUnique({ where: { id: shadowId }, include: { shadows: { select: { sku: true } } } }),
    prisma.product.findUnique({ where: { id: parentId } }),
  ]);
  if (!shadow || !parent) return "Product not found";
  if (parent.shadowParentId) return `${parent.sku} is itself a shadow, so it can't be a shadow parent`;
  if (shadow.shadows.length) return `${shadow.sku} has its own shadows (${shadow.shadows.map((s) => s.sku).join(", ")}), so it can't become a shadow`;
  return null;
}

// PUT /api/products/:id/shadow-parent — { parentId | null }: link this (old)
// SKU to the new SKU it moved to, or unlink it. Nothing else changes.
router.put(
  "/:id/shadow-parent",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parentId = req.body.parentId ? Number(req.body.parentId) : null;
    if (parentId) {
      const problem = await shadowLinkProblem(id, parentId);
      if (problem) return res.status(400).json({ message: problem });
    }
    const updated = await prisma.product.update({ where: { id }, data: { shadowParentId: parentId } });
    res.json({ id: updated.id, shadowParentId: updated.shadowParentId });
  })
);

// PUT /api/products/:id/shadows — { shadowIds }: set which old SKUs are
// shadows of this (new) SKU. Ones left out are unlinked.
router.put(
  "/:id/shadows",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const shadowIds = [...new Set((req.body.shadowIds || []).map(Number))];
    for (const shadowId of shadowIds) {
      // eslint-disable-next-line no-await-in-loop
      const problem = await shadowLinkProblem(shadowId, id);
      if (problem) return res.status(400).json({ message: problem });
    }
    await prisma.$transaction([
      prisma.product.updateMany({ where: { shadowParentId: id, id: { notIn: shadowIds } }, data: { shadowParentId: null } }),
      prisma.product.updateMany({ where: { id: { in: shadowIds } }, data: { shadowParentId: id } }),
    ]);
    res.json({ id, shadowIds });
  })
);

// PUT /api/products/:id/stock — set on-hand quantity per warehouse, e.g. to
// correct a count or set up a product that was created without initial stock.
// This is a direct correction, distinct from logging a Restock (which records
// an incoming shipment with an expected date, not an immediate adjustment).
router.put(
  "/:id/stock",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { stock } = req.body;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (!Array.isArray(stock) || stock.length === 0) {
      return res.status(400).json({ message: "stock must be a non-empty array of { warehouseId, onHand }" });
    }

    const warehouseIds = stock.map((s) => s.warehouseId);
    const warehouses = await prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } });
    if (warehouses.length !== new Set(warehouseIds).size) {
      return res.status(400).json({ message: "One or more warehouseId values are invalid" });
    }
    if (stock.some((s) => !Number.isInteger(s.onHand) || s.onHand < 0)) {
      return res.status(400).json({ message: "onHand must be a non-negative integer" });
    }

    await prisma.$transaction(
      stock.map((s) =>
        prisma.warehouseStock.upsert({
          where: { productId_warehouseId: { productId: id, warehouseId: s.warehouseId } },
          update: { onHand: s.onHand },
          create: { productId: id, warehouseId: s.warehouseId, onHand: s.onHand },
        })
      )
    );

    const updatedStock = await prisma.warehouseStock.findMany({ where: { productId: id } });
    res.json({ productId: id, stock: updatedStock });
  })
);

// DELETE /api/products/:id — delete a product, blocked if it has order lines or
// restocks (those are historical records tied to real orders/shipments and must
// not silently disappear). Its warehouse_stock rows are removed along with it.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const [orderLineCount, restockCount] = await Promise.all([
      prisma.orderLine.count({ where: { productId: id } }),
      prisma.restock.count({ where: { productId: id } }),
    ]);

    if (orderLineCount > 0 || restockCount > 0) {
      return res.status(409).json({
        message: `Cannot delete ${product.sku}: it has ${orderLineCount} order line(s) and ${restockCount} restock(s) on record. Remove those first.`,
      });
    }

    await prisma.$transaction([
      prisma.warehouseStock.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);

    res.status(204).end();
  })
);

// GET /api/products/:id/projection — full 12-month projection for one SKU, all warehouses
router.get(
  "/:id/projection",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const timeline = await buildSkuTimeline(product.sku, "month");
    res.json(timeline);
  })
);

// POST /api/products/bulk-stock — update on-hand quantities for many SKUs at once
// Body: [{ sku, stock: [{ warehouseId, onHand }] }, ...]
router.post(
  "/bulk-stock",
  asyncHandler(async (req, res) => {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "Body must be a non-empty array" });
    }

    const skus = rows.map((r) => String(r.sku).trim().toUpperCase());
    const products = await prisma.product.findMany({ where: { sku: { in: skus } } });
    const productBySku = Object.fromEntries(products.map((p) => [p.sku, p]));

    const unknown = skus.filter((s) => !productBySku[s]);
    if (unknown.length) {
      return res.status(400).json({ message: `Unknown SKUs: ${unknown.join(", ")}` });
    }

    const ops = [];
    for (const row of rows) {
      const sku = String(row.sku).trim().toUpperCase();
      const product = productBySku[sku];
      for (const s of row.stock || []) {
        ops.push(
          prisma.warehouseStock.upsert({
            where: { productId_warehouseId: { productId: product.id, warehouseId: s.warehouseId } },
            update: { onHand: s.onHand },
            create: { productId: product.id, warehouseId: s.warehouseId, onHand: s.onHand },
          })
        );
      }
    }
    await prisma.$transaction(ops);
    res.json({ updated: rows.length });
  })
);

module.exports = router;

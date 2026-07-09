const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { checkShortfallBatch, projectInventoryBatch } = require("../services/projection");
const { ORDER_STATUSES } = require("../constants/orderStatuses");

const router = express.Router();

// Moves real on-hand stock when an order's status crosses the Shipped
// boundary. delta=-1 when entering Shipped (goods physically leave), +1 when
// leaving Shipped (correcting a mistake, or deleting a shipped order) — that
// stock movement is the only place "Shipped" differs from Confirmed/Routed,
// which only ever affect forward projections, never real on-hand.
async function adjustStockForShippedTransition(tx, lines, sign) {
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    await tx.warehouseStock.update({
      where: { productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId } },
      data: { onHand: { increment: sign * line.quantity } },
    });
  }
}

function hasUnassignedLine(lines) {
  return lines.some((l) => l.warehouseId == null);
}

function isoDate(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

function serializeShortfall(result) {
  if (result.ok) {
    return { ok: true, balance: result.balance };
  }
  return { ok: false, date: isoDate(result.date), deficit: result.deficit, balance: result.balance };
}

/**
 * Builds per-line projection results for an array of raw line inputs
 * ({ sku, warehouse_id, ship_date }), in 2 batched calls total regardless of
 * how many lines there are: a warehouse-level shortfall check (dip before
 * ship date) and a network-wide point-in-time balance at ship date.
 */
async function buildLineProjections(lines) {
  const shortfallRequests = lines.map((l) => ({
    sku: l.sku,
    warehouseId: l.warehouse_id ?? l.warehouseId ?? null,
    shipDate: new Date(l.ship_date ?? l.shipDate),
  }));
  const networkRequests = lines.map((l) => ({
    sku: l.sku,
    warehouseId: null,
    targetDate: new Date(l.ship_date ?? l.shipDate),
  }));

  const [shortfallResults, networkBalances] = await Promise.all([
    checkShortfallBatch(shortfallRequests),
    projectInventoryBatch(networkRequests),
  ]);

  return lines.map((line, i) => {
    const warehouseId = line.warehouse_id ?? line.warehouseId ?? null;
    return {
      sku: line.sku,
      warehouseId,
      warehouseUnassigned: warehouseId == null,
      quantity: line.quantity,
      shipDate: isoDate(line.ship_date ?? line.shipDate),
      warehouseProjection: serializeShortfall(shortfallResults[i]),
      networkProjectedBalance: networkBalances[i],
      networkShortage: networkBalances[i] < 0,
    };
  });
}

// Suggests the next sequential order number (SO-####) based on the highest
// existing numeric suffix among "SO-" prefixed orders.
async function generateNextOrderNumber() {
  const orders = await prisma.order.findMany({ select: { orderNumber: true } });
  let max = 1000;
  for (const { orderNumber } of orders) {
    const match = /^SO-(\d+)$/i.exec(orderNumber || "");
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `SO-${max + 1}`;
}

// GET /api/orders/next-number — preview the next auto-generated order number,
// used by the New Order form to prefill the field (still overridable).
router.get(
  "/next-number",
  asyncHandler(async (req, res) => {
    res.json({ orderNumber: await generateNextOrderNumber() });
  })
);

// GET /api/orders — list orders with line items, sorted by earliest ship_date
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      include: { lines: { include: { product: true, warehouse: true } } },
    });

    const allLines = orders.flatMap((o) => o.lines);
    const shortfallResults = await checkShortfallBatch(
      allLines.map((l) => ({ sku: l.product.sku, warehouseId: l.warehouseId, shipDate: l.shipDate }))
    );
    const resultByLineId = new Map(allLines.map((l, i) => [l.id, shortfallResults[i]]));

    const serialized = orders.map((order) => {
      const shipDates = order.lines.map((l) => l.shipDate.getTime());
      const earliestShipDate = shipDates.length ? isoDate(new Date(Math.min(...shipDates))) : null;
      const latestShipDate = shipDates.length ? isoDate(new Date(Math.max(...shipDates))) : null;
      const hasAlerts = order.lines.some((l) => !resultByLineId.get(l.id).ok);

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer,
        customerPo: order.customerPo,
        orderDate: isoDate(order.orderDate),
        status: order.status,
        notes: order.notes,
        shipmentId: order.shipmentId,
        lineCount: order.lines.length,
        earliestShipDate,
        latestShipDate,
        alertStatus: hasAlerts ? "Has alerts" : "OK",
        lines: order.lines.map((line) => ({
          id: line.id,
          sku: line.product.sku,
          productName: line.product.name,
          warehouseId: line.warehouseId,
          warehouseName: line.warehouse ? line.warehouse.name : null,
          quantity: line.quantity,
          shipDate: isoDate(line.shipDate),
          projection: serializeShortfall(resultByLineId.get(line.id)),
        })),
      };
    });

    serialized.sort((a, b) => {
      if (!a.earliestShipDate) return 1;
      if (!b.earliestShipDate) return -1;
      return a.earliestShipDate.localeCompare(b.earliestShipDate);
    });

    res.json(serialized);
  })
);

// POST /api/orders — create order with line items, return projection check per line.
// Pass { "dry_run": true } to validate and get projections without persisting anything —
// used by the new-order form's live per-line check as the user fills it in.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { order_number, customer, customer_po, order_date, notes, lines, dry_run } = req.body;
    const status = req.body.status || "CONFIRMED";

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: "At least one line item is required" });
    }
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status "${status}"` });
    }

    const skus = [...new Set(lines.map((l) => l.sku))];
    const products = await prisma.product.findMany({ where: { sku: { in: skus } } });
    const productBySku = new Map(products.map((p) => [p.sku, p]));
    const unknownSkus = skus.filter((s) => !productBySku.has(s));
    if (unknownSkus.length > 0) {
      return res.status(400).json({ message: `Unknown SKUs: ${unknownSkus.join(", ")}` });
    }

    const warehouseIds = [...new Set(lines.map((l) => l.warehouse_id).filter((id) => id != null))];
    if (warehouseIds.length > 0) {
      const warehouses = await prisma.warehouse.findMany({ where: { id: { in: warehouseIds } } });
      if (warehouses.length !== warehouseIds.length) {
        return res.status(400).json({ message: "One or more warehouse_id values are invalid" });
      }
    }

    const lineProjections = await buildLineProjections(lines);

    if (dry_run) {
      return res.json({ dryRun: true, lines: lineProjections });
    }

    if (!customer || !order_date) {
      return res.status(400).json({ message: "customer and order_date are required" });
    }
    if (status === "SHIPPED" && hasUnassignedLine(lines.map((l) => ({ warehouseId: l.warehouse_id ?? null })))) {
      return res.status(400).json({ message: "Cannot create as Shipped: every line must have a warehouse assigned" });
    }

    const maxAttempts = order_number ? 1 : 5;
    let order = null;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const orderNumberToUse = order_number || (await generateNextOrderNumber());
      try {
        // eslint-disable-next-line no-await-in-loop
        order = await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              orderNumber: orderNumberToUse,
              customer,
              customerPo: customer_po,
              orderDate: new Date(order_date),
              status,
              notes,
            },
          });

          const createdLines = lines.map((line) => ({
            orderId: created.id,
            productId: productBySku.get(line.sku).id,
            warehouseId: line.warehouse_id ?? null,
            quantity: line.quantity,
            shipDate: new Date(line.ship_date),
          }));

          await tx.orderLine.createMany({ data: createdLines });

          if (status === "SHIPPED") {
            await adjustStockForShippedTransition(tx, createdLines, -1);
          }

          return created;
        });
        break;
      } catch (err) {
        if (err.code === "P2002") {
          if (order_number) {
            return res.status(409).json({ message: `Order number "${order_number}" already exists` });
          }
          lastError = err;
          continue; // auto-generated number collided with a concurrent insert — retry with a fresh one
        }
        throw err;
      }
    }

    if (!order) {
      throw lastError || new Error("Failed to generate a unique order number");
    }

    res.status(201).json({ order: { ...order, orderDate: isoDate(order.orderDate) }, lines: lineProjections });
  })
);

// GET /api/orders/:id — single order with all line items and per-line projections
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: { lines: { include: { product: true, warehouse: true } } },
    });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const shortfallResults = await checkShortfallBatch(
      order.lines.map((l) => ({ sku: l.product.sku, warehouseId: l.warehouseId, shipDate: l.shipDate }))
    );

    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: order.customer,
      customerPo: order.customerPo,
      orderDate: isoDate(order.orderDate),
      status: order.status,
      notes: order.notes,
      lines: order.lines.map((line, i) => ({
        id: line.id,
        sku: line.product.sku,
        productName: line.product.name,
        warehouseId: line.warehouseId,
        warehouseName: line.warehouse ? line.warehouse.name : null,
        quantity: line.quantity,
        shipDate: isoDate(line.shipDate),
        projection: serializeShortfall(shortfallResults[i]),
      })),
    });
  })
);

// PUT /api/orders/:id/status — transition status. Crossing into/out of
// Shipped moves real on-hand stock (see adjustStockForShippedTransition);
// any other transition (e.g. Confirmed <-> Routed, or into/out of Draft or
// Cancelled) is a label change only, since none of those states have ever
// touched real stock.
router.put(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status "${status}"` });
    }

    const order = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const wasShipped = order.status === "SHIPPED";
    const willBeShipped = status === "SHIPPED";

    if (!wasShipped && willBeShipped && hasUnassignedLine(order.lines)) {
      return res.status(400).json({ message: "Cannot mark as Shipped: every line must have a warehouse assigned" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (!wasShipped && willBeShipped) {
        await adjustStockForShippedTransition(tx, order.lines, -1);
      } else if (wasShipped && !willBeShipped) {
        await adjustStockForShippedTransition(tx, order.lines, 1);
      }
      return tx.order.update({ where: { id }, data: { status } });
    });

    res.json({ id: updated.id, status: updated.status });
  })
);

// DELETE /api/orders/:id — delete order and all line items (cascade). If the
// order was Shipped, restores the stock it had decremented first.
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const order = await prisma.order.findUnique({ where: { id }, include: { lines: true } });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    await prisma.$transaction(async (tx) => {
      if (order.status === "SHIPPED") {
        await adjustStockForShippedTransition(tx, order.lines, 1);
      }
      await tx.order.delete({ where: { id } });
    });

    res.status(204).end();
  })
);

// POST /api/orders/:id/lines — add a new line to an existing order
router.post(
  "/:id/lines",
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const { sku, warehouse_id, quantity, ship_date } = req.body;

    if (!sku || !quantity || !ship_date) {
      return res.status(400).json({ message: "sku, quantity, and ship_date are required" });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "SHIPPED" || order.status === "CANCELLED") {
      return res.status(409).json({ message: `Cannot add a line to a ${order.status.toLowerCase()} order` });
    }

    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return res.status(400).json({ message: `Unknown SKU "${sku}"` });

    let warehouseId = warehouse_id ?? null;
    if (warehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!wh) return res.status(400).json({ message: "Unknown warehouse" });
    }

    const line = await prisma.orderLine.create({
      data: {
        orderId,
        productId: product.id,
        warehouseId,
        quantity,
        shipDate: new Date(ship_date),
      },
      include: { product: true, warehouse: true },
    });

    res.status(201).json({
      id: line.id,
      sku: line.product.sku,
      productName: line.product.name,
      warehouseId: line.warehouseId,
      warehouseName: line.warehouse?.name ?? null,
      quantity: line.quantity,
      shipDate: line.shipDate.toISOString().slice(0, 10),
    });
  })
);

// PUT /api/orders/:id/lines/:lineId — update a single line item
router.put(
  "/:id/lines/:lineId",
  asyncHandler(async (req, res) => {
    const orderId = Number(req.params.id);
    const lineId = Number(req.params.lineId);
    const { sku, warehouse_id, quantity, ship_date } = req.body;

    const existing = await prisma.orderLine.findUnique({
      where: { id: lineId },
      include: { product: true, order: true },
    });
    if (!existing || existing.orderId !== orderId) {
      return res.status(404).json({ message: "Order line not found" });
    }
    if (existing.order.status === "SHIPPED" || existing.order.status === "CANCELLED") {
      return res.status(409).json({
        message: `Cannot edit a line on a ${existing.order.status.toLowerCase()} order`,
      });
    }

    let productId;
    if (sku !== undefined) {
      const product = await prisma.product.findUnique({ where: { sku } });
      if (!product) {
        return res.status(400).json({ message: `Unknown SKU "${sku}"` });
      }
      productId = product.id;
    }

    const updated = await prisma.orderLine.update({
      where: { id: lineId },
      data: {
        ...(productId !== undefined && { productId }),
        ...(warehouse_id !== undefined && { warehouseId: warehouse_id }),
        ...(quantity !== undefined && { quantity }),
        ...(ship_date !== undefined && { shipDate: new Date(ship_date) }),
      },
      include: { product: true, warehouse: true },
    });

    const [projection] = await checkShortfallBatch([
      { sku: updated.product.sku, warehouseId: updated.warehouseId, shipDate: updated.shipDate },
    ]);

    res.json({
      id: updated.id,
      sku: updated.product.sku,
      warehouseId: updated.warehouseId,
      warehouseName: updated.warehouse ? updated.warehouse.name : null,
      quantity: updated.quantity,
      shipDate: isoDate(updated.shipDate),
      projection: serializeShortfall(projection),
    });
  })
);

// PATCH /api/orders/:id/notes — update the notes field only
router.patch(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { notes } = req.body;
    const order = await prisma.order.update({
      where: { id },
      data: { notes: notes ?? null },
    });
    res.json({ notes: order.notes });
  })
);

module.exports = router;

const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");

const { adjustStockForShippedTransition, hasUnassignedLine } = require("../services/shippedStock");
const { assignShadowLines, describeShadowChanges } = require("../services/shadowSkus");
const { loadBolData, renderBolPdf } = require("../services/bol");

const router = Router();
const prisma = new PrismaClient();

function serialize(s) {
  return {
    id: s.id,
    shipmentNumber: s.shipmentNumber,
    pickupDate: s.pickupDate.toISOString(),
    carrier: s.carrier,
    csNumber: s.csNumber,
    status: s.status,
    notes: s.notes,
    warehouseId: s.warehouseId,
    warehouseName: s.warehouse?.name ?? null,
    createdAt: s.createdAt.toISOString(),
    orders: (s.orders || []).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer,
      customerPo: o.customerPo,
      status: o.status,
    })),
  };
}

// Auto-generate next shipment number
async function nextShipmentNumber() {
  const last = await prisma.shipment.findFirst({ orderBy: { id: "desc" } });
  if (!last) return "SHP-001";
  const match = last.shipmentNumber.match(/SHP-(\d+)/);
  if (!match) return "SHP-001";
  return `SHP-${String(Number(match[1]) + 1).padStart(3, "0")}`;
}

// Auto-assign unassigned order lines to the shipment's warehouse
async function autoAssignWarehouse(tx, orderId, warehouseId) {
  if (!warehouseId) return;
  await tx.orderLine.updateMany({
    where: { orderId, warehouseId: null },
    data: { warehouseId },
  });
}

// A scheduled shipment means its orders are routed: move any Draft/Confirmed
// order on it to Routed. Later statuses (Allocated, Shipped) are left alone.
const ROUTABLE_STATUSES = ["DRAFT", "CONFIRMED"];

async function routeScheduledOrders(tx, shipmentId) {
  const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
  if (shipment?.status !== "SCHEDULED") return;
  await tx.order.updateMany({
    where: { shipmentId, status: { in: ROUTABLE_STATUSES } },
    data: { status: "ROUTED" },
  });
}

function loadShipment(tx, id) {
  return tx.shipment.findUnique({ where: { id }, include: { orders: true, warehouse: true } });
}

// GET /api/shipments
router.get("/", async (req, res) => {
  try {
    const shipments = await prisma.shipment.findMany({
      include: { orders: true, warehouse: true },
      orderBy: { pickupDate: "asc" },
    });
    res.json(shipments.map(serialize));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shipments
router.post("/", async (req, res) => {
  try {
    const { pickupDate, carrier, csNumber, notes, warehouseId, orderIds } = req.body;
    const shipmentNumber = await nextShipmentNumber();

    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          shipmentNumber,
          pickupDate: new Date(pickupDate),
          carrier: carrier || null,
          csNumber: csNumber || null,
          notes: notes || null,
          warehouseId: warehouseId || null,
          orders: orderIds?.length ? { connect: orderIds.map((id) => ({ id })) } : undefined,
        },
        include: { orders: true, warehouse: true },
      });

      if (warehouseId && orderIds?.length) {
        for (const oid of orderIds) {
          await autoAssignWarehouse(tx, oid, warehouseId);
        }
      }

      await routeScheduledOrders(tx, created.id);
      return loadShipment(tx, created.id);
    });

    res.status(201).json(serialize(shipment));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/shipments/:id
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { pickupDate, carrier, csNumber, status, notes, warehouseId, orderIds } = req.body;

    const existing = await prisma.shipment.findUnique({ where: { id }, include: { orders: true } });
    if (!existing) return res.status(404).json({ error: "Not found" });

    const markedPickedUp = status === "PICKED_UP" && existing.status !== "PICKED_UP";

    // Figure out which orders are newly added in this update
    const existingOrderIds = new Set(existing.orders.map((o) => o.id));
    const newOrderIds = orderIds
      ? orderIds.filter((oid) => !existingOrderIds.has(oid))
      : [];

    // Effective warehouse: use the new value if provided, otherwise keep existing
    const effectiveWarehouseId =
      warehouseId !== undefined ? warehouseId || null : existing.warehouseId;

    let shadowMessages = [];
    const shipment = await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id },
        data: {
          ...(pickupDate && { pickupDate: new Date(pickupDate) }),
          ...(carrier !== undefined && { carrier: carrier || null }),
          ...(csNumber !== undefined && { csNumber: csNumber || null }),
          ...(status && { status }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(warehouseId !== undefined && { warehouseId: warehouseId || null }),
          ...(orderIds !== undefined && {
            orders: { set: orderIds.map((oid) => ({ id: oid })) },
          }),
        },
        include: { orders: true, warehouse: true },
      });

      // Auto-assign warehouse to newly added orders' unassigned lines
      if (effectiveWarehouseId && newOrderIds.length) {
        for (const oid of newOrderIds) {
          await autoAssignWarehouse(tx, oid, effectiveWarehouseId);
        }
      }

      // Picked up = every order on the truck is Shipped, which takes its
      // stock out of the warehouses (same as marking an order Shipped).
      if (markedPickedUp) {
        const where = { shipmentId: id, status: { notIn: ["SHIPPED", "CANCELLED"] } };
        const pending = await tx.order.findMany({ where, select: { id: true } });
        if (effectiveWarehouseId) {
          for (const o of pending) await autoAssignWarehouse(tx, o.id, effectiveWarehouseId);
        }
        // Shadow-SKU lines go on whichever SKU's boxes actually ship
        shadowMessages = describeShadowChanges(await assignShadowLines(tx, pending.map((o) => o.id)));
        const toShip = await tx.order.findMany({ where, include: { lines: true } });
        const unassigned = toShip.filter((o) => hasUnassignedLine(o.lines));
        if (unassigned.length > 0) {
          const err = new Error(
            `Can't mark Picked Up: ${unassigned.map((o) => o.orderNumber).join(", ")} ` +
            "has lines with no warehouse. Set the shipment's warehouse or assign one on the order."
          );
          err.status = 400;
          throw err;
        }
        const shippedAt = new Date();
        for (const o of toShip) {
          await adjustStockForShippedTransition(tx, o.lines, -1);
          await tx.order.update({ where: { id: o.id }, data: { status: "SHIPPED", shippedAt } });
        }
      }

      await routeScheduledOrders(tx, id);
      return loadShipment(tx, id);
    }, { timeout: 30000 });

    res.json({ ...serialize(shipment), shadowMessages });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, error: err.message });
  }
});

// GET /api/shipments/:id — one shipment with its orders
router.get("/:id", async (req, res) => {
  try {
    const shipment = await loadShipment(prisma, Number(req.params.id));
    if (!shipment) return res.status(404).json({ message: "Shipment not found" });
    res.json(serialize(shipment));
  } catch (err) {
    res.status(500).json({ message: err.message, error: err.message });
  }
});

// GET /api/shipments/:id/bol — what the BOL form starts from
router.get("/:id/bol", async (req, res) => {
  try {
    const data = await loadBolData(prisma, Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Shipment not found" });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message, error: err.message });
  }
});

// POST /api/shipments/:id/bol — { shipTo, pallets, weight, freightClass, nmfc,
// freightTerms, billTo, specialInstructions, trailerNumber, sealNumber, scac }:
// remembers the ship-to for the customer and returns the BOL as a PDF.
router.post("/:id/bol", async (req, res) => {
  try {
    const data = await loadBolData(prisma, Number(req.params.id));
    if (!data) return res.status(404).json({ message: "Shipment not found" });
    if (data.orders.length === 0) return res.status(400).json({ message: "Add orders to this shipment first" });

    const input = req.body || {};
    const shipTo = input.shipTo || {};
    if (!shipTo.name || !shipTo.address) {
      return res.status(400).json({ message: "Ship To needs a name and address" });
    }
    if (data.customer) {
      const saved = {
        name: shipTo.name || null,
        address: shipTo.address || null,
        city: shipTo.city || null,
        state: shipTo.state || null,
        zip: shipTo.zip || null,
        locationNo: shipTo.locationNo || null,
      };
      await prisma.shipToAddress.upsert({
        where: { customer: data.customer },
        update: saved,
        create: { customer: data.customer, ...saved },
      });
    }

    const doc = renderBolPdf(data, input);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="BOL_${data.bolNumber}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message, error: err.message });
  }
});

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// POST /api/shipments/combine — { shipmentIds, keepId }: move every order onto
// the kept shipment and delete the others. Scheduled shipments only.
router.post("/combine", async (req, res) => {
  try {
    const shipmentIds = (req.body.shipmentIds || []).map(Number);
    const keepId = Number(req.body.keepId);
    if (shipmentIds.length < 2) throw httpError(400, "Pick at least two shipments to combine");
    if (!shipmentIds.includes(keepId)) throw httpError(400, "The shipment to keep must be one of the selected shipments");

    const shipments = await prisma.shipment.findMany({ where: { id: { in: shipmentIds } } });
    if (shipments.length !== shipmentIds.length) throw httpError(404, "One or more shipments not found");
    const notScheduled = shipments.filter((s) => s.status !== "SCHEDULED");
    if (notScheduled.length > 0) {
      throw httpError(400, `Only Scheduled shipments can be combined (${notScheduled.map((s) => s.shipmentNumber).join(", ")} isn't)`);
    }

    const keep = shipments.find((s) => s.id === keepId);
    const otherIds = shipmentIds.filter((sid) => sid !== keepId);

    const shipment = await prisma.$transaction(async (tx) => {
      const moving = await tx.order.findMany({ where: { shipmentId: { in: otherIds } }, select: { id: true } });
      await tx.order.updateMany({ where: { shipmentId: { in: otherIds } }, data: { shipmentId: keepId } });
      for (const o of moving) await autoAssignWarehouse(tx, o.id, keep.warehouseId);
      await tx.shipment.deleteMany({ where: { id: { in: otherIds } } });
      await routeScheduledOrders(tx, keepId);
      return loadShipment(tx, keepId);
    });

    res.json(serialize(shipment));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, error: err.message });
  }
});

// POST /api/shipments/:id/split — { orderIds }: move those orders onto a new
// shipment with the same pickup date, carrier and warehouse.
router.post("/:id/split", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const orderIds = (req.body.orderIds || []).map(Number);

    const source = await prisma.shipment.findUnique({ where: { id }, include: { orders: true } });
    if (!source) throw httpError(404, "Shipment not found");
    if (source.status !== "SCHEDULED") throw httpError(400, "Only Scheduled shipments can be split");
    const onShipment = new Set(source.orders.map((o) => o.id));
    if (orderIds.length === 0 || orderIds.some((oid) => !onShipment.has(oid))) {
      throw httpError(400, "Pick orders that are on this shipment");
    }
    if (orderIds.length === source.orders.length) {
      throw httpError(400, "Leave at least one order on the original shipment");
    }

    const shipmentNumber = await nextShipmentNumber();
    const created = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.create({
        data: {
          shipmentNumber,
          pickupDate: source.pickupDate,
          carrier: source.carrier,
          warehouseId: source.warehouseId,
          status: "SCHEDULED",
          orders: { connect: orderIds.map((oid) => ({ id: oid })) },
        },
      });
      return loadShipment(tx, s.id);
    });

    res.status(201).json(serialize(created));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message, error: err.message });
  }
});

// DELETE /api/shipments/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.order.updateMany({ where: { shipmentId: id }, data: { shipmentId: null } });
    await prisma.shipment.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shipments/:id/orders/:orderId — add order to shipment
router.post("/:id/orders/:orderId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const orderId = Number(req.params.orderId);

    const shipment = await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { shipmentId: id } });

      const s = await tx.shipment.findUnique({ where: { id } });
      if (s.warehouseId) {
        await autoAssignWarehouse(tx, orderId, s.warehouseId);
      }
      await routeScheduledOrders(tx, id);
      return loadShipment(tx, id);
    });

    res.json(serialize(shipment));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shipments/:id/orders/:orderId — remove order from shipment
router.delete("/:id/orders/:orderId", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    await prisma.order.update({ where: { id: orderId }, data: { shipmentId: null } });
    const shipment = await prisma.shipment.findUnique({
      where: { id: Number(req.params.id) },
      include: { orders: true, warehouse: true },
    });
    res.json(serialize(shipment));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

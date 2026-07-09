const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");

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

      return created;
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

    const shipment = await prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({
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

      if (markedPickedUp) {
        await tx.order.updateMany({
          where: { shipmentId: id, status: { notIn: ["SHIPPED", "CANCELLED"] } },
          data: { status: "SHIPPED" },
        });
      }

      return updated;
    });

    res.json(serialize(shipment));
  } catch (err) {
    res.status(500).json({ error: err.message });
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

      const s = await tx.shipment.findUnique({ where: { id }, include: { orders: true, warehouse: true } });
      if (s.warehouseId) {
        await autoAssignWarehouse(tx, orderId, s.warehouseId);
      }
      return s;
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

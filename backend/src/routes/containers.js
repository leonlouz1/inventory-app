const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const {
  CONTAINER_STATUSES, CONTAINER_INCLUDE, containerView, syncLines, receiveContainer, unreceiveContainer,
} = require("../services/containers");

const router = express.Router();

const text = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const date = (v) => (v ? new Date(v) : null);

function sendError(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  throw err;
}

async function productIdFor(tx, sku) {
  const product = await tx.product.findUnique({ where: { sku: String(sku || "").trim() } });
  if (!product) throw Object.assign(new Error(`Unknown SKU: ${sku}`), { status: 400 });
  return product.id;
}

function loadContainer(db, id) {
  return db.container.findUnique({ where: { id }, include: CONTAINER_INCLUDE });
}

// GET /api/containers — every container, newest ETA last
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const containers = await prisma.container.findMany({ include: CONTAINER_INCLUDE, orderBy: [{ eta: "asc" }, { id: "asc" }] });
    res.json(containers.map(containerView));
  })
);

// GET /api/containers/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const container = await loadContainer(prisma, Number(req.params.id));
    if (!container) return res.status(404).json({ message: "Container not found" });
    res.json(containerView(container));
  })
);

// POST /api/containers — { containerNumber, poNumber, supplier, warehouseId,
// etd, eta, blNumber, notes, status, lines: [{ sku, quantity, linkedOrderId }] }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const b = req.body;
    const status = b.status || "IN_PRODUCTION";
    if (!b.warehouseId || !b.eta) return res.status(400).json({ message: "Warehouse and ETA are required" });
    if (!CONTAINER_STATUSES.includes(status) || status === "RECEIVED") {
      return res.status(400).json({ message: "Log a container as Draft, On Hold, In Production or En Route, then receive it" });
    }
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (lines.length === 0) return res.status(400).json({ message: "Add at least one SKU" });
    if (lines.some((l) => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1)) {
      return res.status(400).json({ message: "Every SKU needs a quantity of 1 or more" });
    }

    try {
      const id = await prisma.$transaction(async (tx) => {
        const container = await tx.container.create({
          data: {
            containerNumber: text(b.containerNumber),
            poNumber: text(b.poNumber),
            supplier: text(b.supplier),
            warehouseId: Number(b.warehouseId),
            etd: date(b.etd),
            eta: new Date(b.eta),
            blNumber: text(b.blNumber),
            notes: text(b.notes),
            status,
          },
        });
        for (const l of lines) {
          await tx.restock.create({
            data: {
              containerId: container.id,
              productId: await productIdFor(tx, l.sku),
              warehouseId: container.warehouseId,
              quantity: Number(l.quantity),
              expectedDate: container.eta,
              supplier: container.supplier,
              status,
              linkedOrderId: l.linkedOrderId ? Number(l.linkedOrderId) : null,
            },
          });
        }
        return container.id;
      });
      res.status(201).json(containerView(await loadContainer(prisma, id)));
    } catch (err) {
      sendError(res, err);
    }
  })
);

// PUT /api/containers/:id — container details and status (not Received; use
// /receive). Changes flow to every line that hasn't been received.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    const existing = await prisma.container.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Container not found" });
    if (b.status !== undefined) {
      if (!CONTAINER_STATUSES.includes(b.status)) return res.status(400).json({ message: "Invalid status" });
      if (b.status === "RECEIVED" && existing.status !== "RECEIVED") {
        return res.status(400).json({ message: "Use Receive to confirm the quantities that arrived" });
      }
      if (existing.status === "RECEIVED" && b.status !== "RECEIVED") {
        return res.status(400).json({ message: "Use Undo receive to move a received container back" });
      }
    }
    if (existing.status === "RECEIVED" && b.warehouseId !== undefined && Number(b.warehouseId) !== existing.warehouseId) {
      return res.status(400).json({ message: "A received container's warehouse can't change" });
    }

    await prisma.$transaction(async (tx) => {
      const container = await tx.container.update({
        where: { id },
        data: {
          ...(b.containerNumber !== undefined && { containerNumber: text(b.containerNumber) }),
          ...(b.poNumber !== undefined && { poNumber: text(b.poNumber) }),
          ...(b.supplier !== undefined && { supplier: text(b.supplier) }),
          ...(b.warehouseId !== undefined && { warehouseId: Number(b.warehouseId) }),
          ...(b.etd !== undefined && { etd: date(b.etd) }),
          ...(b.eta !== undefined && b.eta && { eta: new Date(b.eta) }),
          ...(b.blNumber !== undefined && { blNumber: text(b.blNumber) }),
          ...(b.notes !== undefined && { notes: text(b.notes) }),
          ...(b.status !== undefined && { status: b.status }),
        },
      });
      await syncLines(tx, container);
    });
    res.json(containerView(await loadContainer(prisma, id)));
  })
);

// POST /api/containers/:id/lines — { sku, quantity, linkedOrderId }
router.post(
  "/:id/lines",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) return res.status(404).json({ message: "Container not found" });
    if (container.status === "RECEIVED") return res.status(400).json({ message: "This container was already received" });
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ message: "Quantity must be 1 or more" });
    try {
      await prisma.restock.create({
        data: {
          containerId: id,
          productId: await productIdFor(prisma, req.body.sku),
          warehouseId: container.warehouseId,
          quantity,
          expectedDate: container.eta,
          supplier: container.supplier,
          status: container.status,
          linkedOrderId: req.body.linkedOrderId ? Number(req.body.linkedOrderId) : null,
        },
      });
      res.status(201).json(containerView(await loadContainer(prisma, id)));
    } catch (err) {
      sendError(res, err);
    }
  })
);

// PUT /api/containers/:id/lines/:lineId — { sku, quantity, linkedOrderId }
// (ordered quantity; only before the container is received)
router.put(
  "/:id/lines/:lineId",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const line = await prisma.restock.findFirst({ where: { id: Number(req.params.lineId), containerId: id } });
    if (!line) return res.status(404).json({ message: "Line not found" });
    if (line.status === "RECEIVED") return res.status(400).json({ message: "This line was already received" });
    const b = req.body;
    try {
      await prisma.restock.update({
        where: { id: line.id },
        data: {
          ...(b.sku !== undefined && { productId: await productIdFor(prisma, b.sku) }),
          ...(b.quantity !== undefined && { quantity: Number(b.quantity) }),
          ...(b.linkedOrderId !== undefined && { linkedOrderId: b.linkedOrderId ? Number(b.linkedOrderId) : null }),
        },
      });
      res.json(containerView(await loadContainer(prisma, id)));
    } catch (err) {
      sendError(res, err);
    }
  })
);

// DELETE /api/containers/:id/lines/:lineId (only before it's received)
router.delete(
  "/:id/lines/:lineId",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const line = await prisma.restock.findFirst({ where: { id: Number(req.params.lineId), containerId: id } });
    if (!line) return res.status(404).json({ message: "Line not found" });
    if (line.status === "RECEIVED") return res.status(400).json({ message: "Undo the receive before removing a received line" });
    await prisma.restock.delete({ where: { id: line.id } });
    res.json(containerView(await loadContainer(prisma, id)));
  })
);

// POST /api/containers/:id/split — { containerNumber, eta, etd, blNumber,
// lines: [{ lineId, quantity }] }: moves those quantities onto a new container
// (e.g. a 30,000-piece order shipping in three containers). The new container
// copies supplier, PO, warehouse and status; a full line moves as-is, a
// partial one is split in two.
router.post(
  "/:id/split",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const source = await prisma.container.findUnique({ where: { id }, include: { lines: true } });
    if (!source) return res.status(404).json({ message: "Container not found" });
    if (source.status === "RECEIVED") return res.status(400).json({ message: "A received container can't be split" });

    const lineById = new Map(source.lines.map((l) => [l.id, l]));
    const moves = (req.body.lines || [])
      .map((m) => ({ line: lineById.get(Number(m.lineId)), quantity: Number(m.quantity) }))
      .filter((m) => m.quantity > 0);
    if (moves.length === 0) return res.status(400).json({ message: "Enter a quantity to move for at least one SKU" });
    for (const m of moves) {
      if (!m.line) return res.status(400).json({ message: "A line doesn't belong to this container" });
      if (!Number.isInteger(m.quantity) || m.quantity > m.line.quantity) {
        return res.status(400).json({ message: `Can't move more than ${m.line.quantity} of a line` });
      }
    }
    const moving = moves.reduce((s, m) => s + m.quantity, 0);
    const total = source.lines.reduce((s, l) => s + l.quantity, 0);
    if (moving === total) return res.status(400).json({ message: "Leave something on this container" });

    const b = req.body;
    const newId = await prisma.$transaction(async (tx) => {
      const created = await tx.container.create({
        data: {
          containerNumber: text(b.containerNumber),
          poNumber: source.poNumber,
          supplier: source.supplier,
          warehouseId: source.warehouseId,
          etd: b.etd !== undefined ? date(b.etd) : source.etd,
          eta: b.eta ? new Date(b.eta) : source.eta,
          blNumber: text(b.blNumber),
          notes: source.notes,
          status: source.status,
        },
      });
      for (const { line, quantity } of moves) {
        if (quantity === line.quantity) {
          await tx.restock.update({ where: { id: line.id }, data: { containerId: created.id } });
        } else {
          await tx.restock.update({ where: { id: line.id }, data: { quantity: line.quantity - quantity } });
          await tx.restock.create({
            data: {
              containerId: created.id,
              productId: line.productId,
              warehouseId: line.warehouseId,
              quantity,
              expectedDate: line.expectedDate,
              supplier: line.supplier,
              status: line.status,
              linkedOrderId: line.linkedOrderId,
            },
          });
        }
      }
      await syncLines(tx, created);
      return created.id;
    });
    res.status(201).json(containerView(await loadContainer(prisma, newId)));
  })
);

// POST /api/containers/:id/receive — { lines: [{ id, receivedQuantity }] }:
// confirm or correct what arrived; those quantities go into stock and the
// difference from what was ordered is kept on each line.
router.post(
  "/:id/receive",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const receivedByLine = new Map((req.body.lines || []).map((l) => [Number(l.id), Number(l.receivedQuantity)]));
    try {
      await prisma.$transaction((tx) => receiveContainer(tx, id, receivedByLine));
      res.json(containerView(await loadContainer(prisma, id)));
    } catch (err) {
      sendError(res, err);
    }
  })
);

// POST /api/containers/:id/unreceive — undo a receive (stock comes back out)
router.post(
  "/:id/unreceive",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    try {
      await prisma.$transaction((tx) => unreceiveContainer(tx, id));
      res.json(containerView(await loadContainer(prisma, id)));
    } catch (err) {
      sendError(res, err);
    }
  })
);

// DELETE /api/containers/:id — removes the container and its lines; if it was
// received, its received stock is taken back out first
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) return res.status(404).json({ message: "Container not found" });
    await prisma.$transaction(async (tx) => {
      if (container.status === "RECEIVED") await unreceiveContainer(tx, id);
      await tx.restock.deleteMany({ where: { containerId: id } });
      await tx.container.delete({ where: { id } });
    });
    res.status(204).end();
  })
);

module.exports = router;

const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

// Saved linesheets for buyers. Not available to designers (they include costs).
const router = express.Router();

const money = (v) => (v == null ? null : Number(v));
const text = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

function header(l) {
  return {
    id: l.id,
    name: l.name,
    customer: l.customer,
    notes: l.notes,
    destinationId: l.destinationId,
    includeWarehouse: l.includeWarehouse,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

// GET /api/linesheets — every linesheet with its product count
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const sheets = await prisma.linesheet.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
    res.json(sheets.map((l) => ({ ...header(l), itemCount: l._count.items })));
  })
);

// POST /api/linesheets — { name, customer }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = text(req.body.name);
    if (!name) return res.status(400).json({ message: "Name is required" });
    const destination = await prisma.costDestination.findFirst({ orderBy: { name: "asc" } });
    const l = await prisma.linesheet.create({
      data: { name, customer: text(req.body.customer), destinationId: destination?.id ?? null },
    });
    res.status(201).json(header(l));
  })
);

// GET /api/linesheets/:id — header plus items (product details and costs come
// from /api/costs/products)
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const l = await prisma.linesheet.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        items: { orderBy: [{ block: "asc" }, { sortOrder: "asc" }] },
      },
    });
    if (!l) return res.status(404).json({ message: "Linesheet not found" });
    res.json({
      ...header(l),
      items: l.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        block: i.block,
        sortOrder: i.sortOrder,
        price: money(i.price),
        qty: i.qty,
        originId: i.originId,
      })),
    });
  })
);

// PUT /api/linesheets/:id — { name, customer, notes, destinationId, includeWarehouse,
// items: [{ productId, block, price, qty, originId }] } — saves the whole sheet
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    const existing = await prisma.linesheet.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Linesheet not found" });
    if (b.name !== undefined && !text(b.name)) return res.status(400).json({ message: "Name is required" });

    await prisma.$transaction(async (tx) => {
      await tx.linesheet.update({
        where: { id },
        data: {
          ...(b.name !== undefined && { name: text(b.name) }),
          ...(b.customer !== undefined && { customer: text(b.customer) }),
          ...(b.notes !== undefined && { notes: text(b.notes) }),
          ...(b.destinationId !== undefined && { destinationId: b.destinationId ? Number(b.destinationId) : null }),
          ...(b.includeWarehouse !== undefined && { includeWarehouse: Boolean(b.includeWarehouse) }),
          updatedAt: new Date(),
        },
      });
      if (Array.isArray(b.items)) {
        await tx.linesheetItem.deleteMany({ where: { linesheetId: id } });
        if (b.items.length) {
          await tx.linesheetItem.createMany({
            data: b.items.map((item, i) => ({
              linesheetId: id,
              productId: Number(item.productId),
              block: Number(item.block) || 0,
              sortOrder: i,
              price: item.price === "" || item.price == null ? null : Number(item.price),
              qty: item.qty === "" || item.qty == null ? null : Math.round(Number(item.qty)),
              originId: item.originId ? Number(item.originId) : null,
            })),
          });
        }
      }
    });
    res.json({ ok: true });
  })
);

// POST /api/linesheets/:id/duplicate — copy a sheet (e.g. for another buyer)
router.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const source = await prisma.linesheet.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!source) return res.status(404).json({ message: "Linesheet not found" });
    const copy = await prisma.linesheet.create({
      data: {
        name: `${source.name} (copy)`,
        customer: source.customer,
        notes: source.notes,
        destinationId: source.destinationId,
        includeWarehouse: source.includeWarehouse,
        items: {
          create: source.items.map(({ productId, block, sortOrder, price, qty, originId }) => ({ productId, block, sortOrder, price, qty, originId })),
        },
      },
    });
    res.status(201).json(header(copy));
  })
);

// DELETE /api/linesheets/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.linesheet.deleteMany({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  })
);

module.exports = router;

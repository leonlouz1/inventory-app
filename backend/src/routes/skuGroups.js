const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { PENDING_STATUSES } = require("../constants/orderStatuses");

const router = express.Router();

async function serializeGroup(group) {
  const products = await prisma.product.findMany({
    where: { groupId: group.id },
    include: { stock: true },
  });

  const productIds = products.map((p) => p.id);
  const [pendingByProduct, incomingByProduct] = await Promise.all([
    prisma.orderLine.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, order: { status: { in: PENDING_STATUSES } } },
      _sum: { quantity: true },
    }),
    prisma.restock.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, status: { notIn: ["DRAFT", "RECEIVED"] } },
      _sum: { quantity: true },
    }),
  ]);

  const pendingMap = new Map(pendingByProduct.map((r) => [r.productId, r._sum.quantity ?? 0]));
  const incomingMap = new Map(incomingByProduct.map((r) => [r.productId, r._sum.quantity ?? 0]));

  return {
    id: group.id,
    name: group.name,
    skus: products.map((p) => {
      const onHand = p.stock.reduce((s, w) => s + w.onHand, 0);
      const committed = pendingMap.get(p.id) ?? 0;
      const incoming = incomingMap.get(p.id) ?? 0;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        onHand,
        committed,
        incoming,
        available: onHand - committed,
      };
    }),
  };
}

// GET /api/sku-groups/suggestions — find SKUs sharing the same base (before last dash)
router.get(
  "/suggestions",
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true, brand: true, groupId: true } });

    const byBase = new Map();
    for (const p of products) {
      const dashIdx = p.sku.lastIndexOf("-");
      if (dashIdx === -1) continue; // no dash, can't infer a group
      const base = p.sku.slice(0, dashIdx);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(p);
    }

    const suggestions = [];
    for (const [base, skus] of byBase) {
      if (skus.length < 2) continue;
      suggestions.push({ base, skus });
    }

    suggestions.sort((a, b) => a.base.localeCompare(b.base));
    res.json(suggestions);
  })
);

// GET /api/sku-groups
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const groups = await prisma.productGroup.findMany({ orderBy: { name: "asc" } });
    const result = await Promise.all(groups.map(serializeGroup));
    res.json(result);
  })
);

// POST /api/sku-groups
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });
    try {
      const group = await prisma.productGroup.create({ data: { name } });
      res.status(201).json(await serializeGroup(group));
    } catch (err) {
      if (err.code === "P2002") return res.status(409).json({ message: `Group "${name}" already exists` });
      throw err;
    }
  })
);

// PUT /api/sku-groups/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name } = req.body;
    try {
      const group = await prisma.productGroup.update({ where: { id }, data: { name } });
      res.json(await serializeGroup(group));
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ message: "Group not found" });
      if (err.code === "P2002") return res.status(409).json({ message: `Group "${name}" already exists` });
      throw err;
    }
  })
);

// DELETE /api/sku-groups/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    try {
      await prisma.$transaction([
        prisma.product.updateMany({ where: { groupId: id }, data: { groupId: null } }),
        prisma.productGroup.delete({ where: { id } }),
      ]);
      res.status(204).end();
    } catch (err) {
      if (err.code === "P2025") return res.status(404).json({ message: "Group not found" });
      throw err;
    }
  })
);

// POST /api/sku-groups/:id/skus — add a SKU to a group
router.post(
  "/:id/skus",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { sku } = req.body;
    if (!sku) return res.status(400).json({ message: "sku is required" });
    const product = await prisma.product.findUnique({ where: { sku: sku.trim().toUpperCase() } });
    if (!product) return res.status(404).json({ message: `Unknown SKU: ${sku}` });
    const group = await prisma.productGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ message: "Group not found" });
    await prisma.product.update({ where: { id: product.id }, data: { groupId: id } });
    res.json(await serializeGroup(group));
  })
);

// DELETE /api/sku-groups/:id/skus/:productId — remove a SKU from a group
router.delete(
  "/:id/skus/:productId",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const productId = Number(req.params.productId);
    await prisma.product.update({ where: { id: productId }, data: { groupId: null } });
    const group = await prisma.productGroup.findUnique({ where: { id } });
    if (!group) return res.status(404).json({ message: "Group not found" });
    res.json(await serializeGroup(group));
  })
);

module.exports = router;

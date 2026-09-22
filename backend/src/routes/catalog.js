const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { PENDING_STATUSES } = require("../constants/orderStatuses");

const router = express.Router();

function serializeCatalog(p) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand ?? null,
    category: p.category ?? null,
    description: p.description,
    wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
    retailPrice: p.retailPrice ? Number(p.retailPrice) : null,
    imageUrl: p.imageUrl,
    casePack: p.casePack,
    upc: p.upc,
  };
}

// GET /api/catalog — all products with catalog fields (internal)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({ orderBy: { sku: "asc" } });
    res.json(products.map(serializeCatalog));
  })
);

// GET /api/catalog/:sku — public product page data (no inventory info)
router.get(
  "/:sku",
  asyncHandler(async (req, res) => {
    const sku = req.params.sku.trim().toUpperCase();
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(serializeCatalog(product));
  })
);

// PATCH /api/catalog/:id — update catalog fields only
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { description, wholesalePrice, retailPrice, imageUrl, casePack, upc } = req.body;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(description !== undefined && { description: description || null }),
        ...(wholesalePrice !== undefined && { wholesalePrice: wholesalePrice || null }),
        ...(retailPrice !== undefined && { retailPrice: retailPrice || null }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
        ...(casePack !== undefined && { casePack: Number(casePack) }),
        ...(upc !== undefined && { upc: upc || null }),
      },
    });
    res.json(serializeCatalog(product));
  })
);

// GET /api/catalog/report/available-to-sell — Excel download data
router.get(
  "/report/available-to-sell",
  asyncHandler(async (req, res) => {
    const [products, pending, incoming] = await Promise.all([
      prisma.product.findMany({ orderBy: { sku: "asc" }, include: { stock: true } }),
      prisma.orderLine.groupBy({
        by: ["productId"],
        where: { order: { status: { in: PENDING_STATUSES } } },
        _sum: { quantity: true },
      }),
      prisma.restock.groupBy({
        by: ["productId"],
        where: { status: { notIn: ["DRAFT", "RECEIVED"] } },
        _sum: { quantity: true },
      }),
    ]);

    const pendingMap = new Map(pending.map((r) => [r.productId, r._sum.quantity ?? 0]));
    const incomingMap = new Map(incoming.map((r) => [r.productId, r._sum.quantity ?? 0]));

    const rows = products.map((p) => {
      const onHand = p.stock.reduce((s, w) => s + w.onHand, 0);
      const committed = pendingMap.get(p.id) ?? 0;
      const incomingQty = incomingMap.get(p.id) ?? 0;
      const available = onHand - committed;
      return {
        sku: p.sku,
        name: p.name,
        brand: p.brand ?? null,
        category: p.category ?? null,
        description: p.description,
        wholesalePrice: p.wholesalePrice ? Number(p.wholesalePrice) : null,
        retailPrice: p.retailPrice ? Number(p.retailPrice) : null,
        casePack: p.casePack,
        upc: p.upc,
        imageUrl: p.imageUrl,
        onHand,
        committed,
        incoming: incomingQty,
        available,
      };
    });

    res.json(rows);
  })
);

module.exports = router;

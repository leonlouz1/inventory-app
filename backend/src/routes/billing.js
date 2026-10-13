const express = require("express");
const router = express.Router();
const prisma = require("../prismaClient");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isoDate(date) {
  return date ? date.toISOString() : null;
}

function serializeOrder(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customer: order.customer,
    customerPo: order.customerPo,
    orderDate: isoDate(order.orderDate),
    shippedAt: order.shippedAt ? order.shippedAt.toISOString().slice(0, 10) : null,
    invoicedAt: isoDate(order.invoicedAt),
    lines: order.lines.map((l) => ({
      id: l.id,
      sku: l.product.sku,
      productName: l.product.name,
      quantity: l.quantity,
      casePack: l.product.casePack,
      warehouseName: l.warehouse?.name ?? null,
      shipDate: l.shipDate ? l.shipDate.toISOString().slice(0, 10) : null,
      containerNumber: l.containerNumber ?? null,
      cartonMarking: l.cartonMarking ?? null,
    })),
  };
}

// GET /api/billing — all SHIPPED orders with their invoice status
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: { status: "SHIPPED" },
      orderBy: { orderDate: "desc" },
      include: {
        lines: { include: { product: true, warehouse: true } },
      },
    });
    res.json(orders.map(serializeOrder));
  })
);

// PATCH /api/billing/:id/invoice — mark as invoiced (or unmark)
router.patch(
  "/:id/invoice",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { invoiced } = req.body; // true = mark invoiced, false = unmark
    const order = await prisma.order.update({
      where: { id },
      data: { invoicedAt: invoiced ? new Date() : null },
    });
    res.json({ invoicedAt: isoDate(order.invoicedAt) });
  })
);

module.exports = router;

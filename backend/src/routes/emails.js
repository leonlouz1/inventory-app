const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");
const { sendEmail, invoiceHtml, routingHtml, buildOrderExcel } = require("../emailService");

const router = Router();
const prisma = new PrismaClient();

function isoDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

function serializeOrder(order) {
  return {
    orderNumber: order.orderNumber,
    customer: order.customer,
    customerPo: order.customerPo || null,
    orderDate: isoDate(order.orderDate),
    status: order.status,
    notes: order.notes || null,
    lines: order.lines.map((l) => ({
      sku: l.product.sku,
      productName: l.product.name,
      quantity: l.quantity,
      shipDate: isoDate(l.shipDate),
      warehouseName: l.warehouse?.name || null,
    })),
  };
}

// POST /api/emails/invoice
// Body: { orderId, to, extraNotes? }
router.post("/invoice", async (req, res) => {
  try {
    const { orderId, to, extraNotes } = req.body;
    if (!orderId || !to) return res.status(400).json({ message: "orderId and to are required" });

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { lines: { include: { product: true, warehouse: true } } },
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const serialized = serializeOrder(order);
    if (extraNotes) serialized.notes = [serialized.notes, extraNotes].filter(Boolean).join(" — ");

    const html = invoiceHtml({ order: serialized, lines: serialized.lines });
    const attachment = buildOrderExcel({ order: serialized, lines: serialized.lines });
    await sendEmail({
      to,
      subject: `Order Confirmation — ${order.orderNumber} — ${order.customer}`,
      html,
      attachments: [{ filename: `${order.orderNumber}.xlsx`, content: attachment }],
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/emails/routing
// Body: { orderId, to, notes? }
router.post("/routing", async (req, res) => {
  try {
    const { orderId, to, notes } = req.body;
    if (!orderId || !to) return res.status(400).json({ message: "orderId and to are required" });

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { lines: { include: { product: true, warehouse: true } } },
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const serialized = serializeOrder(order);
    if (notes) serialized.routingNotes = notes;
    const html = routingHtml({ order: serialized, lines: serialized.lines, notes });
    const attachment = buildOrderExcel({ order: serialized, lines: serialized.lines });
    await sendEmail({
      to,
      subject: `Routing Instructions — ${order.orderNumber} — ${order.customer}`,
      html,
      attachments: [{ filename: `${order.orderNumber}-routing.xlsx`, content: attachment }],
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/emails/order-defaults/:orderId
// Returns suggested to-address for invoice (CRM contact email) and routing (warehouse email)
router.get("/order-defaults/:orderId", async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(req.params.orderId) },
      include: { lines: { include: { warehouse: true } } },
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Customer email: find a CRM contact for this retailer with an email
    const retailer = await prisma.retailer.findFirst({
      where: { name: { equals: order.customer, mode: "insensitive" } },
      include: { contacts: { where: { email: { not: null } } } },
    });
    const customerEmail = retailer?.contacts?.[0]?.email || null;

    // Warehouse email: use the first assigned warehouse on the order
    const warehouse = order.lines.find((l) => l.warehouse)?.warehouse || null;
    const warehouseEmail = warehouse?.email || null;
    const warehouseName = warehouse?.name || null;

    res.json({ customerEmail, warehouseEmail, warehouseName });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

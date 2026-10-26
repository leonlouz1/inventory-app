const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { logOrderChanges } = require("../services/orderHistory");
const { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS: KIND_LABELS } = require("../constants/documentKinds");

// Files kept on an order (the customer's PO, revisions, etc.), stored in the
// database so they can be viewed or downloaded later.
const router = express.Router();

const MAX_BYTES = 15 * 1024 * 1024;
const LIST_FIELDS = { id: true, orderId: true, filename: true, kind: true, contentType: true, size: true, uploadedBy: true, createdAt: true };

// GET /api/order-documents?orderId=12
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const orderId = Number(req.query.orderId);
    if (!orderId) return res.status(400).json({ message: "orderId is required" });
    res.json(await prisma.orderDocument.findMany({ where: { orderId }, select: LIST_FIELDS, orderBy: { createdAt: "asc" } }));
  })
);

const describeDoc = (kind, filename) => `${KIND_LABELS[kind] || kind}: ${filename}`;

// POST /api/order-documents — { orderId, filename, kind?, contentType, data: base64 }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const orderId = Number(req.body.orderId);
    const filename = String(req.body.filename || "").trim().slice(0, 255);
    const contentType = String(req.body.contentType || "application/octet-stream").slice(0, 150);
    if (!orderId || !filename) return res.status(400).json({ message: "orderId and filename are required" });
    const kind = req.body.kind || "OTHER";
    if (!DOCUMENT_KINDS.includes(kind)) return res.status(400).json({ message: "Unknown file type" });
    const buffer = Buffer.from(String(req.body.data || ""), "base64");
    if (!buffer.length) return res.status(400).json({ message: "The file is empty" });
    if (buffer.length > MAX_BYTES) return res.status(400).json({ message: "File is too large (15 MB max)" });

    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const doc = await prisma.orderDocument.create({
      data: { orderId, filename, kind, contentType, size: buffer.length, data: buffer, uploadedBy: req.userName || null },
      select: LIST_FIELDS,
    });
    await logOrderChanges(prisma, req, { orderId, field: "Document", before: null, after: describeDoc(kind, filename), note: "File added" });
    res.status(201).json(doc);
  })
);

// GET /api/order-documents/:id/file — the file itself
router.get(
  "/:id/file",
  asyncHandler(async (req, res) => {
    const doc = await prisma.orderDocument.findUnique({ where: { id: Number(req.params.id) } });
    if (!doc) return res.status(404).json({ message: "File not found" });
    res.set("Content-Type", doc.contentType);
    res.set("Content-Disposition", `inline; filename="${doc.filename.replace(/["\\\r\n]/g, "_")}"`);
    res.send(Buffer.from(doc.data));
  })
);

// PATCH /api/order-documents/:id — { kind }: change what the file is
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const kind = req.body.kind;
    if (!DOCUMENT_KINDS.includes(kind)) return res.status(400).json({ message: "Unknown file type" });
    const doc = await prisma.orderDocument.findUnique({ where: { id: Number(req.params.id) }, select: LIST_FIELDS });
    if (!doc) return res.status(404).json({ message: "File not found" });
    const updated = await prisma.orderDocument.update({ where: { id: doc.id }, data: { kind }, select: LIST_FIELDS });
    await logOrderChanges(prisma, req, {
      orderId: doc.orderId, field: `Document type (${doc.filename})`, before: KIND_LABELS[doc.kind], after: KIND_LABELS[kind],
    });
    res.json(updated);
  })
);

// DELETE /api/order-documents/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await prisma.orderDocument.findUnique({ where: { id: Number(req.params.id) }, select: LIST_FIELDS });
    if (!doc) return res.status(404).json({ message: "File not found" });
    await prisma.orderDocument.delete({ where: { id: doc.id } });
    await logOrderChanges(prisma, req, { orderId: doc.orderId, field: "Document", before: describeDoc(doc.kind, doc.filename), after: null, note: "File removed" });
    res.status(204).end();
  })
);

module.exports = router;

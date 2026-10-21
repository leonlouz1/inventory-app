const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

// Product photos uploaded from the app (resized in the browser first), kept in
// the database and served publicly so the catalog site and Excel exports can
// load them.
const router = express.Router();

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;

// POST /api/images — { data: base64, contentType, productId? }. With a
// productId, the image becomes that product's image.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { data, contentType, productId } = req.body;
    if (!ALLOWED.includes(contentType)) return res.status(400).json({ message: "Use a JPG, PNG or WEBP image" });
    const buffer = Buffer.from(String(data || ""), "base64");
    if (!buffer.length) return res.status(400).json({ message: "Empty image" });
    if (buffer.length > MAX_BYTES) return res.status(400).json({ message: "Image is too large (3 MB max)" });

    const image = await prisma.storedImage.create({ data: { contentType, data: buffer } });
    const url = `${req.protocol}://${req.get("host")}/api/images/${image.id}`;
    if (productId) await prisma.product.update({ where: { id: Number(productId) }, data: { imageUrl: url } });
    res.status(201).json({ id: image.id, url });
  })
);

// GET /api/images/:id — the image itself (public)
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const image = await prisma.storedImage.findUnique({ where: { id: Number(req.params.id) } });
    if (!image) return res.status(404).end();
    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(Buffer.from(image.data));
  })
);

module.exports = router;

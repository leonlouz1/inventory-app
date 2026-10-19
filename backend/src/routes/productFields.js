const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const initialFields = require("../data/productFields.json");

const router = express.Router();

// First start: load the fields from the Category Fields spreadsheet.
async function seedProductFields(db) {
  if ((await db.productField.count()) > 0) return;
  await db.productField.createMany({
    data: initialFields.map((f, i) => ({ ...f, options: f.options ?? undefined, sortOrder: i })),
  });
  console.log(`Loaded ${initialFields.length} product fields`);
}

// GET /api/product-fields — every field with its categories and choices
router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await prisma.productField.findMany({ orderBy: { sortOrder: "asc" } }));
  })
);

// POST /api/product-fields/:key/options — { value }: add a dropdown choice
router.post(
  "/:key/options",
  asyncHandler(async (req, res) => {
    const value = String(req.body.value || "").trim();
    if (!value) return res.status(400).json({ message: "Enter a value" });

    const field = await prisma.productField.findUnique({ where: { key: req.params.key } });
    if (!field) return res.status(404).json({ message: "Field not found" });
    if (!Array.isArray(field.options)) return res.status(400).json({ message: `${field.label} isn't a dropdown` });

    const existing = field.options.find((o) => o.toLowerCase() === value.toLowerCase());
    if (existing) return res.json({ ...field, added: existing });

    const updated = await prisma.productField.update({
      where: { key: field.key },
      data: { options: [...field.options, value] },
    });
    res.status(201).json({ ...updated, added: value });
  })
);

module.exports = { router, seedProductFields };

const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { FIRST_BRAND, LAST_BRAND, CODE_LENGTH, fullUpc, isValidSku, splitSku } = require("../services/upc");

const router = express.Router();

async function loadCodeNames() {
  const codes = await prisma.upcCode.findMany();
  const names = { brand: {}, style: {}, color: {} };
  for (const c of codes) names[c.kind][c.code] = c.name;
  return names;
}

function describe(sku, names) {
  const parts = splitSku(sku);
  return {
    brandCode: parts.brand,
    styleCode: parts.style,
    colorCode: parts.color,
    brandName: names.brand[parts.brand] ?? null,
    styleName: names.style[parts.style] ?? null,
    colorName: names.color[parts.color] ?? null,
  };
}

// GET /api/upc/codes — brand, style and color code lists
router.get(
  "/codes",
  asyncHandler(async (req, res) => {
    const codes = await prisma.upcCode.findMany({ orderBy: [{ kind: "asc" }, { code: "asc" }] });
    res.json({
      brands: codes.filter((c) => c.kind === "brand"),
      styles: codes.filter((c) => c.kind === "style"),
      colors: codes.filter((c) => c.kind === "color"),
    });
  })
);

// POST /api/upc/codes — add a code { kind, code, name }
router.post(
  "/codes",
  asyncHandler(async (req, res) => {
    const kind = String(req.body.kind || "");
    const code = String(req.body.code ?? "").trim();
    const name = String(req.body.name || "").trim();

    const length = CODE_LENGTH[kind];
    if (!length) return res.status(400).json({ message: "kind must be brand, style or color" });
    if (!new RegExp(`^\\d{${length}}$`).test(code)) {
      return res.status(400).json({ message: `${kind} code must be exactly ${length} digit${length > 1 ? "s" : ""}` });
    }
    if (kind === "brand" && (Number(code) < FIRST_BRAND || Number(code) > LAST_BRAND)) {
      return res.status(400).json({ message: `Brand code must be between ${FIRST_BRAND} and ${LAST_BRAND}` });
    }
    if (!name) return res.status(400).json({ message: "Name is required" });

    try {
      const created = await prisma.upcCode.create({ data: { kind, code, name } });
      res.status(201).json(created);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: `${kind} code ${code} already exists` });
      }
      throw err;
    }
  })
);

// PUT /api/upc/codes/:id — rename a code
router.put(
  "/codes/:id",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Name is required" });
    const updated = await prisma.upcCode.update({ where: { id: Number(req.params.id) }, data: { name } });
    res.json(updated);
  })
);

// DELETE /api/upc/codes/:id — blocked while an in-use number relies on it
router.delete(
  "/codes/:id",
  asyncHandler(async (req, res) => {
    const code = await prisma.upcCode.findUnique({ where: { id: Number(req.params.id) } });
    if (!code) return res.status(404).json({ message: "Code not found" });

    const inUse = await prisma.upcAssignment.findMany({ where: { inUse: true } });
    const using = inUse.filter((a) => splitSku(a.sku)[code.kind] === code.code);
    if (using.length > 0) {
      return res.status(409).json({
        message: `Can't delete: ${using.length} in-use number${using.length > 1 ? "s use" : " uses"} this code (e.g. ${using[0].sku})`,
      });
    }

    await prisma.upcCode.delete({ where: { id: code.id } });
    res.status(204).end();
  })
);

// GET /api/upc?brand=24 — every number in one brand's range (xx000–xx999)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const brand = Number(req.query.brand);
    if (!Number.isInteger(brand) || brand < FIRST_BRAND || brand > LAST_BRAND) {
      return res.status(400).json({ message: `brand must be between ${FIRST_BRAND} and ${LAST_BRAND}` });
    }

    const skus = Array.from({ length: 1000 }, (_, i) => String(brand * 1000 + i));
    const [names, assignments, products] = await Promise.all([
      loadCodeNames(),
      prisma.upcAssignment.findMany({ where: { sku: { in: skus } } }),
      prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, name: true } }),
    ]);
    const inUseBySku = new Map(assignments.map((a) => [a.sku, a.inUse]));
    const productBySku = new Map(products.map((p) => [p.sku, p]));

    res.json(
      skus.map((sku) => ({
        sku,
        upc: fullUpc(sku),
        ...describe(sku, names),
        inUse: inUseBySku.get(sku) ?? false,
        product: productBySku.get(sku) ?? null,
      }))
    );
  })
);

// PATCH /api/upc/:sku — { inUse }. Marking in use creates the product (once),
// with brand, style and color filled in from the codes. Unmarking leaves the
// product alone; products are only removed from the Products page.
router.patch(
  "/:sku",
  asyncHandler(async (req, res) => {
    const sku = String(req.params.sku);
    if (!isValidSku(sku)) return res.status(400).json({ message: `${sku} is not a valid item number` });
    const inUse = Boolean(req.body.inUse);
    const names = await loadCodeNames();
    const info = describe(sku, names);

    if (inUse) {
      const missing = [
        !info.brandName && `brand ${info.brandCode}`,
        !info.styleName && `style ${info.styleCode}`,
        !info.colorName && `color ${info.colorCode}`,
      ].filter(Boolean);
      if (missing.length > 0) {
        return res.status(400).json({ message: `Set up ${missing.join(", ")} under Manage Codes first` });
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      await tx.upcAssignment.upsert({
        where: { sku },
        update: { inUse },
        create: { sku, inUse },
      });

      const existing = await tx.product.findUnique({ where: { sku }, select: { id: true, sku: true, name: true } });
      if (!inUse || existing) return existing;

      const created = await tx.product.create({
        data: {
          sku,
          name: `${info.brandName} ${info.styleName} ${info.colorName}`,
          brand: info.brandName,
          productType: info.styleName,
          color: info.colorName,
          upc: fullUpc(sku),
        },
        select: { id: true, sku: true, name: true },
      });
      const warehouses = await tx.warehouse.findMany();
      await tx.warehouseStock.createMany({
        data: warehouses.map((w) => ({ productId: created.id, warehouseId: w.id, onHand: 0 })),
      });
      return created;
    });

    res.json({ sku, upc: fullUpc(sku), ...info, inUse, product });
  })
);

module.exports = router;

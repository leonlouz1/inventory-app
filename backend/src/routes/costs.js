const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

// Landed cost: origins (China, Thailand), destinations (New York, Los Angeles)
// with their warehouse delivery fee, container price per route, and each
// product's cost per origin. Not available to designers (see auth middleware).
const router = express.Router();

const money = (v) => (v == null ? null : Number(v));
const text = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function parseNumber(v, label, { int = false, allowZero = true } = {}) {
  const n = Number(v);
  if (v === "" || v == null || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || (int && !Number.isInteger(n))) {
    throw badRequest(`${label} must be ${int ? "a whole number" : "a number"}${allowZero ? "" : " above 0"}`);
  }
  return n;
}

function sourcingView(s) {
  return {
    id: s.id,
    productId: s.productId,
    originId: s.originId,
    originName: s.origin?.name ?? null,
    factoryPrice: money(s.factoryPrice),
    htsCode: s.htsCode,
    dutyRate: money(s.dutyRate),
    extraDutyRate: money(s.extraDutyRate),
    unitsPerContainer: s.unitsPerContainer,
    updatedAt: s.updatedAt.toISOString(),
  };
}

async function handle(res, fn) {
  try {
    await fn();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    if (err.code === "P2002") return res.status(409).json({ message: "That name is already used" });
    throw err;
  }
}

// GET /api/costs/rates — origins, destinations (with warehouse fee) and route prices
router.get(
  "/rates",
  asyncHandler(async (req, res) => {
    const [origins, destinations, routes] = await Promise.all([
      prisma.costOrigin.findMany({ orderBy: { name: "asc" } }),
      prisma.costDestination.findMany({ orderBy: { name: "asc" } }),
      prisma.freightRoute.findMany(),
    ]);
    res.json({
      origins,
      destinations: destinations.map((d) => ({ ...d, warehouseFee: money(d.warehouseFee) })),
      routes: routes.map((r) => ({
        originId: r.originId,
        destinationId: r.destinationId,
        containerPrice: money(r.containerPrice),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  })
);

// POST /api/costs/origins { name } · PUT /api/costs/origins/:id { name } · DELETE
router.post("/origins", asyncHandler((req, res) => handle(res, async () => {
  const name = text(req.body.name);
  if (!name) throw badRequest("Name is required");
  res.status(201).json(await prisma.costOrigin.create({ data: { name } }));
})));
router.put("/origins/:id", asyncHandler((req, res) => handle(res, async () => {
  const name = text(req.body.name);
  if (!name) throw badRequest("Name is required");
  res.json(await prisma.costOrigin.update({ where: { id: Number(req.params.id) }, data: { name } }));
})));
router.delete("/origins/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.productSourcing.count({ where: { originId: id } });
  if (used) return res.status(409).json({ message: `${used} product cost${used === 1 ? " uses" : "s use"} this origin` });
  await prisma.costOrigin.delete({ where: { id } });
  res.status(204).end();
}));

// POST /api/costs/destinations { name, warehouseFee } · PUT { name?, warehouseFee? } · DELETE
router.post("/destinations", asyncHandler((req, res) => handle(res, async () => {
  const name = text(req.body.name);
  if (!name) throw badRequest("Name is required");
  const warehouseFee = req.body.warehouseFee == null ? 0 : parseNumber(req.body.warehouseFee, "Warehouse fee");
  res.status(201).json(await prisma.costDestination.create({ data: { name, warehouseFee } }));
})));
router.put("/destinations/:id", asyncHandler((req, res) => handle(res, async () => {
  const data = {};
  if (req.body.name !== undefined) {
    data.name = text(req.body.name);
    if (!data.name) throw badRequest("Name is required");
  }
  if (req.body.warehouseFee !== undefined) data.warehouseFee = parseNumber(req.body.warehouseFee, "Warehouse fee");
  const d = await prisma.costDestination.update({ where: { id: Number(req.params.id) }, data });
  res.json({ ...d, warehouseFee: money(d.warehouseFee) });
})));
router.delete("/destinations/:id", asyncHandler(async (req, res) => {
  await prisma.costDestination.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

// PUT /api/costs/routes { originId, destinationId, containerPrice } — set a route's container price
router.put("/routes", asyncHandler((req, res) => handle(res, async () => {
  const originId = Number(req.body.originId);
  const destinationId = Number(req.body.destinationId);
  const containerPrice = parseNumber(req.body.containerPrice, "Container price");
  const route = await prisma.freightRoute.upsert({
    where: { originId_destinationId: { originId, destinationId } },
    update: { containerPrice },
    create: { originId, destinationId, containerPrice },
  });
  res.json({ originId, destinationId, containerPrice: money(route.containerPrice), updatedAt: route.updatedAt.toISOString() });
})));

// GET /api/costs/products — every product with its wholesale price and cost per origin
router.get(
  "/products",
  asyncHandler(async (req, res) => {
    const products = await prisma.product.findMany({
      orderBy: { sku: "asc" },
      select: {
        id: true, sku: true, name: true, brand: true, category: true, imageUrl: true,
        wholesalePrice: true, retailPrice: true, casePack: true, attributes: true,
        sourcing: { include: { origin: true } },
      },
    });
    res.json(products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      imageUrl: p.imageUrl,
      casePack: p.casePack,
      packSize: p.attributes?.packSize ?? null,
      wholesalePrice: money(p.wholesalePrice),
      retailPrice: money(p.retailPrice),
      sourcing: p.sourcing.map(sourcingView),
    })));
  })
);

// GET /api/costs/products/:productId — one product's costs per origin (product page)
router.get(
  "/products/:productId",
  asyncHandler(async (req, res) => {
    const sourcing = await prisma.productSourcing.findMany({
      where: { productId: Number(req.params.productId) },
      include: { origin: true },
      orderBy: { origin: { name: "asc" } },
    });
    res.json(sourcing.map(sourcingView));
  })
);

function sourcingData(body) {
  return {
    factoryPrice: parseNumber(body.factoryPrice, "Factory price"),
    htsCode: text(body.htsCode),
    dutyRate: body.dutyRate == null || body.dutyRate === "" ? 0 : parseNumber(body.dutyRate, "Duty %"),
    extraDutyRate: body.extraDutyRate == null || body.extraDutyRate === "" ? 0 : parseNumber(body.extraDutyRate, "Second duty %"),
    unitsPerContainer: parseNumber(body.unitsPerContainer, "Units per container", { int: true, allowZero: false }),
  };
}

// PUT /api/costs/products/:productId/sourcing/:originId — set a product's cost for one origin
router.put("/products/:productId/sourcing/:originId", asyncHandler((req, res) => handle(res, async () => {
  const productId = Number(req.params.productId);
  const originId = Number(req.params.originId);
  const data = sourcingData(req.body);
  const s = await prisma.productSourcing.upsert({
    where: { productId_originId: { productId, originId } },
    update: data,
    create: { productId, originId, ...data },
    include: { origin: true },
  });
  res.json(sourcingView(s));
})));

// DELETE /api/costs/products/:productId/sourcing/:originId
router.delete("/products/:productId/sourcing/:originId", asyncHandler(async (req, res) => {
  await prisma.productSourcing.deleteMany({
    where: { productId: Number(req.params.productId), originId: Number(req.params.originId) },
  });
  res.status(204).end();
}));

// POST /api/costs/import { rows: [{ sku, origin, factoryPrice, htsCode, dutyRate,
// extraDutyRate, unitsPerContainer }] } — spreadsheet upload, all or nothing.
// Unknown origins are created.
router.post("/import", asyncHandler((req, res) => handle(res, async () => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw badRequest("Nothing to import");
  const products = await prisma.product.findMany({ where: { sku: { in: rows.map((r) => String(r.sku)) } }, select: { id: true, sku: true } });
  const productBySku = new Map(products.map((p) => [p.sku, p.id]));
  const unknown = rows.filter((r) => !productBySku.has(String(r.sku))).map((r) => r.sku);
  if (unknown.length) throw badRequest(`Unknown SKUs: ${[...new Set(unknown)].slice(0, 10).join(", ")}`);
  const prepared = rows.map((r, i) => {
    const origin = text(r.origin);
    if (!origin) throw badRequest(`Row ${i + 2}: origin is required`);
    try {
      return { productId: productBySku.get(String(r.sku)), origin, data: sourcingData(r) };
    } catch (err) {
      throw badRequest(`Row ${i + 2} (${r.sku}): ${err.message}`);
    }
  });
  await prisma.$transaction(async (tx) => {
    const originIds = new Map();
    for (const name of [...new Set(prepared.map((p) => p.origin))]) {
      const o = await tx.costOrigin.upsert({ where: { name }, update: {}, create: { name } });
      originIds.set(name, o.id);
    }
    for (const p of prepared) {
      const originId = originIds.get(p.origin);
      await tx.productSourcing.upsert({
        where: { productId_originId: { productId: p.productId, originId } },
        update: p.data,
        create: { productId: p.productId, originId, ...p.data },
      });
    }
  }, { timeout: 60000 });
  res.json({ imported: prepared.length });
})));

module.exports = router;

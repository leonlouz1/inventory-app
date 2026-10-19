const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const {
  FIRST_BRAND, LAST_BRAND, CODE_LENGTH, fullUpc, splitSku, isTravelRange, otherProductName,
} = require("../services/upc");
const { createUpcProduct } = require("../services/upcProducts");

const router = express.Router();

async function loadCodeNames() {
  const codes = await prisma.upcCode.findMany();
  const names = { brand: {}, style: {}, color: {}, range: {} };
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
      ranges: codes.filter((c) => c.kind === "range"),
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
    if (!length) return res.status(400).json({ message: "kind must be brand, style, color or range" });
    if (!new RegExp(`^\\d{${length}}$`).test(code)) {
      return res.status(400).json({ message: `${kind} code must be exactly ${length} digit${length > 1 ? "s" : ""}` });
    }
    if (kind === "brand" && (Number(code) < FIRST_BRAND || Number(code) > LAST_BRAND)) {
      return res.status(400).json({ message: `Brand code must be between ${FIRST_BRAND} and ${LAST_BRAND}` });
    }
    if (kind === "range" && isTravelRange(code)) {
      return res.status(400).json({ message: `${FIRST_BRAND}–${LAST_BRAND} are Travel ranges; pick another number` });
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
    const using = inUse.filter((a) =>
      code.kind === "range"
        ? a.sku.slice(0, 2) === code.code
        : isTravelRange(a.sku.slice(0, 2)) && splitSku(a.sku)[code.kind] === code.code
    );
    if (using.length > 0) {
      return res.status(409).json({
        message: `Can't delete: ${using.length} in-use number${using.length > 1 ? "s use" : " uses"} this code (e.g. ${using[0].sku})`,
      });
    }

    await prisma.upcCode.delete({ where: { id: code.id } });
    res.status(204).end();
  })
);

// GET /api/upc/grid — one row per style + color combination, with each
// brand's number for it (e.g. style 11 + color 1 -> 24111, 25111, ...)
router.get(
  "/grid",
  asyncHandler(async (req, res) => {
    const codes = await prisma.upcCode.findMany({ orderBy: { code: "asc" } });
    const brands = codes.filter((c) => c.kind === "brand");
    const styles = codes.filter((c) => c.kind === "style");
    const colors = codes.filter((c) => c.kind === "color");

    const combos = styles.flatMap((s) => colors.map((c) => ({ style: s, color: c })));
    const skus = combos.flatMap(({ style, color }) => brands.map((b) => b.code + style.code + color.code));
    const [assignments, products] = await Promise.all([
      prisma.upcAssignment.findMany({ where: { sku: { in: skus } } }),
      prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, name: true } }),
    ]);
    const inUseBySku = new Map(assignments.map((a) => [a.sku, a.inUse]));
    const productBySku = new Map(products.map((p) => [p.sku, p]));

    res.json({
      brands: brands.map((b) => ({ code: b.code, name: b.name })),
      rows: combos.map(({ style, color }) => ({
        key: style.code + color.code,
        styleCode: style.code,
        colorCode: color.code,
        styleName: style.name,
        colorName: color.name,
        brands: Object.fromEntries(
          brands.map((b) => {
            const sku = b.code + style.code + color.code;
            return [b.code, { sku, inUse: inUseBySku.get(sku) ?? false, product: productBySku.get(sku) ?? null }];
          })
        ),
      })),
    });
  })
);

function otherDetails(a) {
  return {
    name: a?.name ?? null,
    brand: a?.brand ?? null,
    color: a?.color ?? null,
    category: a?.category ?? null,
    packSize: a?.packSize ?? null,
    casePack: a?.casePack ?? null,
    attributes: a?.attributes ?? {},
    groupId: a?.groupId ?? null,
  };
}

async function isKnownRange(prefix) {
  if (isTravelRange(prefix)) return true;
  return Boolean(await prisma.upcCode.findUnique({ where: { kind_code: { kind: "range", code: prefix } } }));
}

function otherRow(sku, assignment, product) {
  return {
    sku,
    upc: fullUpc(sku),
    ...otherDetails(assignment),
    inUse: assignment?.inUse ?? false,
    product: product ?? null,
  };
}

// GET /api/upc/custom — non-Travel numbers outside any named range (e.g. a
// 22xxx number created by hand)
router.get(
  "/custom",
  asyncHandler(async (req, res) => {
    const ranges = new Set((await prisma.upcCode.findMany({ where: { kind: "range" } })).map((r) => r.code));
    const assignments = (await prisma.upcAssignment.findMany({ orderBy: { sku: "asc" } }))
      .filter((a) => !isTravelRange(a.sku.slice(0, 2)) && !ranges.has(a.sku.slice(0, 2)));
    const products = await prisma.product.findMany({
      where: { sku: { in: assignments.map((a) => a.sku) } },
      select: { id: true, sku: true, name: true },
    });
    const productBySku = new Map(products.map((p) => [p.sku, p]));
    res.json(assignments.map((a) => otherRow(a.sku, a, productBySku.get(a.sku))));
  })
);

// GET /api/upc/number/:sku — one non-Travel number, for the Create form
router.get(
  "/number/:sku",
  asyncHandler(async (req, res) => {
    const sku = String(req.params.sku);
    if (!/^\d{5}$/.test(sku)) return res.status(400).json({ message: "Enter a 5-digit number" });
    if (isTravelRange(sku.slice(0, 2))) {
      return res.status(400).json({ message: `${FIRST_BRAND}xxx–${LAST_BRAND}xxx are Travel numbers; use the Travel tab` });
    }
    const [assignment, product] = await Promise.all([
      prisma.upcAssignment.findUnique({ where: { sku } }),
      prisma.product.findUnique({ where: { sku } }),
    ]);
    const row = otherRow(sku, assignment, product && { id: product.id, sku: product.sku, name: product.name });
    // Already a product but not on the UPC list yet: prefill from the product
    if (product && !assignment?.name) {
      const attributes = product.attributes ?? {};
      row.prefill = {
        name: product.name,
        brand: product.brand,
        color: product.color || attributes.color || null,
        category: product.category,
        packSize: attributes.packSize ? Number(attributes.packSize) || null : null,
        casePack: product.casePack,
        attributes,
      };
    }
    if (product?.upc && product.upc !== row.upc) row.productUpc = product.upc;
    res.json(row);
  })
);

// GET /api/upc?range=24 — every number in one range (xx000–xx999). Travel
// ranges decode brand/style/color; other ranges return typed-in details.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const prefix = String(req.query.range ?? req.query.brand ?? "");
    if (!/^\d{2}$/.test(prefix) || !(await isKnownRange(prefix))) {
      return res.status(400).json({ message: `${prefix} isn't a UPC range` });
    }
    const brand = Number(prefix);
    const skus = Array.from({ length: 1000 }, (_, i) => String(brand * 1000 + i));

    if (!isTravelRange(prefix)) {
      const [assignments, products] = await Promise.all([
        prisma.upcAssignment.findMany({ where: { sku: { in: skus } } }),
        prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, name: true } }),
      ]);
      const assignmentBySku = new Map(assignments.map((a) => [a.sku, a]));
      const productBySku = new Map(products.map((p) => [p.sku, p]));
      return res.json(skus.map((sku) => otherRow(sku, assignmentBySku.get(sku), productBySku.get(sku))));
    }

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
    if (!/^\d{5}$/.test(sku)) return res.status(400).json({ message: `${sku} is not a valid item number` });
    // Any non-Travel number can be filled in, even outside a named range
    if (!isTravelRange(sku.slice(0, 2))) return updateOtherNumber(sku, req, res);
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

      return createUpcProduct(tx, {
        sku,
        name: `${info.brandName} ${info.styleName} ${info.colorName}`,
        brand: info.brandName,
        productType: info.styleName,
        color: info.colorName,
      });
    });

    res.json({ sku, upc: fullUpc(sku), ...info, inUse, product });
  })
);

function createOtherProduct(tx, sku, details) {
  return createUpcProduct(tx, {
    sku,
    name: otherProductName(details),
    brand: details.brand,
    color: details.color,
    category: details.category,
    casePack: details.casePack,
    attributes: {
      ...details.attributes,
      ...(details.color && { color: details.color }),
      ...(details.packSize && { packSize: String(details.packSize) }),
    },
  });
}

// Other-category number: { inUse?, name?, brand?, color?, category?, packSize? }.
// Details can be saved any time; marking in use needs a name and creates the
// product (once) as "Name Color N Pack". Unmarking leaves the product alone.
async function updateOtherNumber(sku, req, res) {
  const body = req.body;
  const text = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
  const details = {};
  for (const key of ["name", "brand", "color", "category"]) {
    if (body[key] !== undefined) details[key] = text(body[key]);
  }
  if (body.casePack !== undefined) {
    const n = body.casePack === null || body.casePack === "" ? null : Number(body.casePack);
    if (n !== null && (!Number.isInteger(n) || n < 1)) {
      return res.status(400).json({ message: "Case pack must be a whole number" });
    }
    details.casePack = n;
  }
  if (body.attributes !== undefined) {
    details.attributes = body.attributes && typeof body.attributes === "object" ? body.attributes : {};
  }
  if (body.packSize !== undefined) {
    const n = body.packSize === null || body.packSize === "" ? null : Number(body.packSize);
    if (n !== null && (!Number.isInteger(n) || n < 1)) {
      return res.status(400).json({ message: "Pack size must be a whole number" });
    }
    details.packSize = n;
  }

  const current = await prisma.upcAssignment.findUnique({ where: { sku } });
  const inUse = body.inUse !== undefined ? Boolean(body.inUse) : current?.inUse ?? false;
  const merged = { ...otherDetails(current), ...details };
  if (inUse && !merged.name) {
    return res.status(400).json({ message: "Give this number a name before marking it in use" });
  }

  const product = await prisma.$transaction(async (tx) => {
    await tx.upcAssignment.upsert({
      where: { sku },
      update: { inUse, ...details },
      create: { sku, inUse, ...details },
    });
    const existing = await tx.product.findUnique({ where: { sku }, select: { id: true, sku: true, name: true, upc: true } });
    if (existing) {
      // Linking an existing product: give it its UPC if it has none
      if (inUse && !existing.upc) await tx.product.update({ where: { id: existing.id }, data: { upc: fullUpc(sku) } });
      return { id: existing.id, sku: existing.sku, name: existing.name };
    }
    if (!inUse) return null;
    return createOtherProduct(tx, sku, merged);
  });

  res.json({ sku, upc: fullUpc(sku), ...merged, inUse, product });
}

// ---- Groups: product families on the Other categories tab ----

// A number is free when nobody has filled it in, marked it in use, or made it a product
async function freeNumbersFrom(tx, startSku, count) {
  const prefix = startSku.slice(0, 2);
  const end = Number(prefix) * 1000 + 999;
  const candidates = [];
  for (let n = Number(startSku); n <= end; n++) candidates.push(String(n).padStart(5, "0"));
  const [assignments, products] = await Promise.all([
    tx.upcAssignment.findMany({ where: { sku: { in: candidates } } }),
    tx.product.findMany({ where: { sku: { in: candidates } }, select: { sku: true } }),
  ]);
  const taken = new Set([
    ...assignments.filter((a) => a.inUse || a.name).map((a) => a.sku),
    ...products.map((pr) => pr.sku),
  ]);
  const free = candidates.filter((c) => !taken.has(c)).slice(0, count);
  if (free.length < count) {
    throw Object.assign(new Error(`Not enough free numbers left in ${prefix}xxx after ${startSku}`), { status: 400 });
  }
  return free;
}

function cleanText(v) {
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

function cleanPack(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error("Pack size must be a whole number"), { status: 400 });
  return n;
}

// Creates numbers for variants (color/pack combos) of one product in a group
async function addVariants(tx, groupId, base, variants, startSku, inUse) {
  const skus = await freeNumbersFrom(tx, startSku, variants.length);
  const created = [];
  for (let i = 0; i < variants.length; i++) {
    const sku = skus[i];
    const details = {
      name: base.name,
      brand: base.brand,
      category: base.category,
      casePack: base.casePack ?? null,
      attributes: base.attributes || {},
      color: cleanText(variants[i].color),
      packSize: cleanPack(variants[i].packSize),
    };
    await tx.upcAssignment.upsert({
      where: { sku },
      update: { ...details, inUse, groupId },
      create: { sku, ...details, inUse, groupId },
    });
    if (inUse) await createOtherProduct(tx, sku, details);
    created.push(sku);
  }
  return created;
}

function sendError(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  throw err;
}

// GET /api/upc/groups
router.get(
  "/groups",
  asyncHandler(async (req, res) => {
    res.json(await prisma.upcGroup.findMany({ orderBy: { name: "asc" } }));
  })
);

// GET /api/upc/next-free?from=23000&count=5 — the free numbers a new group
// starting at `from` would get (for the Create group preview)
router.get(
  "/next-free",
  asyncHandler(async (req, res) => {
    const from = String(req.query.from || "");
    const count = Math.min(Math.max(Number(req.query.count) || 1, 1), 200);
    if (!/^\d{5}$/.test(from) || isTravelRange(from.slice(0, 2))) {
      return res.status(400).json({ message: "Enter a non-Travel 5-digit number" });
    }
    try {
      const skus = await freeNumbersFrom(prisma, from, count);
      res.json(skus.map((sku) => ({ sku, upc: fullUpc(sku) })));
    } catch (err) {
      sendError(res, err);
    }
  })
);

// POST /api/upc/groups — { groupName, startSku, base: { name, brand, category,
// attributes }, variants: [{ color, packSize }], inUse }: a new product family
// on consecutive free numbers starting at startSku
router.post(
  "/groups",
  asyncHandler(async (req, res) => {
    const { startSku, variants, inUse = true } = req.body;
    const base = {
      name: cleanText(req.body.base?.name),
      brand: cleanText(req.body.base?.brand),
      category: cleanText(req.body.base?.category),
      casePack: Number.isInteger(Number(req.body.base?.casePack)) && Number(req.body.base?.casePack) > 0
        ? Number(req.body.base.casePack) : null,
      attributes: req.body.base?.attributes || {},
    };
    const groupName = cleanText(req.body.groupName) || base.name;
    if (!base.name) return res.status(400).json({ message: "Name is required" });
    if (!Array.isArray(variants) || variants.length === 0) {
      return res.status(400).json({ message: "Add at least one color or pack size" });
    }
    if (!/^\d{5}$/.test(String(startSku)) || isTravelRange(String(startSku).slice(0, 2))) {
      return res.status(400).json({ message: "Starting number must be a non-Travel 5-digit number" });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const group = await tx.upcGroup.create({ data: { name: groupName } });
        const skus = await addVariants(tx, group.id, base, variants, String(startSku), Boolean(inUse));
        return { group, skus };
      }, { timeout: 30000 });
      res.status(201).json(result);
    } catch (err) {
      sendError(res, err);
    }
  })
);

// POST /api/upc/groups/:id/variants — { color, packSize, inUse }: one more
// color/pack of the group's product, on the next free number after the group
router.post(
  "/groups/:id/variants",
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.id);
    const members = await prisma.upcAssignment.findMany({ where: { groupId }, orderBy: { sku: "asc" } });
    if (members.length === 0) return res.status(404).json({ message: "Group not found" });

    try {
      const color = cleanText(req.body.color);
      const packSize = cleanPack(req.body.packSize);
      if (members.some((m) => (m.color || null) === color && (m.packSize || null) === packSize)) {
        return res.status(409).json({ message: "This group already has that color and pack size" });
      }
      const first = members[0];
      const base = { name: first.name, brand: first.brand, category: first.category, casePack: first.casePack, attributes: first.attributes };
      const last = members[members.length - 1].sku;
      const result = await prisma.$transaction((tx) =>
        addVariants(tx, groupId, base, [{ color, packSize }], String(Number(last) + 1).padStart(5, "0"), req.body.inUse !== false)
      );
      res.status(201).json({ skus: result });
    } catch (err) {
      sendError(res, err);
    }
  })
);

// POST /api/upc/groups/assign — { skus, groupId } adds numbers to a group, or
// { skus, name } puts them in a new group
router.post(
  "/groups/assign",
  asyncHandler(async (req, res) => {
    const skus = (req.body.skus || []).map(String);
    if (skus.length === 0) return res.status(400).json({ message: "Pick numbers to group" });
    if (skus.some((sku) => !/^\d{5}$/.test(sku) || isTravelRange(sku.slice(0, 2)))) {
      return res.status(400).json({ message: "Only Other-category numbers can be grouped here" });
    }
    let groupId = req.body.groupId ? Number(req.body.groupId) : null;
    if (groupId && !(await prisma.upcGroup.findUnique({ where: { id: groupId } }))) {
      return res.status(404).json({ message: "Group not found" });
    }
    const name = cleanText(req.body.name);
    if (!groupId && !name) return res.status(400).json({ message: "Name the new group" });

    const group = await prisma.$transaction(async (tx) => {
      const g = groupId ? await tx.upcGroup.findUnique({ where: { id: groupId } }) : await tx.upcGroup.create({ data: { name } });
      for (const sku of skus) {
        await tx.upcAssignment.upsert({ where: { sku }, update: { groupId: g.id }, create: { sku, groupId: g.id } });
      }
      return g;
    });
    await deleteEmptyGroups();
    res.json(group);
  })
);

// PUT /api/upc/groups/:id — { name }
router.put(
  "/groups/:id",
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name);
    if (!name) return res.status(400).json({ message: "Name is required" });
    res.json(await prisma.upcGroup.update({ where: { id: Number(req.params.id) }, data: { name } }));
  })
);

// DELETE /api/upc/groups/:id/members/:sku — take one number out of its group
router.delete(
  "/groups/:id/members/:sku",
  asyncHandler(async (req, res) => {
    await prisma.upcAssignment.updateMany({
      where: { sku: String(req.params.sku), groupId: Number(req.params.id) },
      data: { groupId: null },
    });
    await deleteEmptyGroups();
    res.status(204).end();
  })
);

// DELETE /api/upc/groups/:id — break up a group (numbers and products stay)
router.delete(
  "/groups/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await prisma.upcAssignment.updateMany({ where: { groupId: id }, data: { groupId: null } });
    await prisma.upcGroup.deleteMany({ where: { id } });
    res.status(204).end();
  })
);

async function deleteEmptyGroups() {
  const used = await prisma.upcAssignment.findMany({ where: { groupId: { not: null } }, select: { groupId: true }, distinct: ["groupId"] });
  await prisma.upcGroup.deleteMany({ where: { id: { notIn: used.map((u) => u.groupId) } } });
}

module.exports = router;

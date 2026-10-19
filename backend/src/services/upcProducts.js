const { fullUpc, isTravelRange } = require("./upc");
const { defaultCasePack } = require("../constants/categories");

// Creates the product for a UPC item number (SKU = the 5 middle digits) with
// zero stock in every warehouse. Returns { id, sku, name }.
async function createUpcProduct(tx, { sku, name, brand, productType, color, category, casePack, attributes }) {
  const created = await tx.product.create({
    data: {
      sku,
      name,
      brand: brand || null,
      productType: productType || null,
      color: color || null,
      category: category || null,
      upc: fullUpc(sku),
      casePack: casePack || defaultCasePack(category),
      ...(attributes && { attributes }),
    },
    select: { id: true, sku: true, name: true },
  });
  const warehouses = await tx.warehouse.findMany();
  await tx.warehouseStock.createMany({
    data: warehouses.map((w) => ({ productId: created.id, warehouseId: w.id, onHand: 0 })),
  });
  return created;
}

// The UPC a product must have when its SKU is a number from the UPC system
// (Travel 24-29, or any number on the UPC page); null for other SKUs, whose
// UPC stays free to edit.
async function systemUpcFor(db, sku) {
  if (!/^\d{5}$/.test(sku || "")) return null;
  if (isTravelRange(sku.slice(0, 2))) return fullUpc(sku);
  const assignment = await db.upcAssignment.findUnique({ where: { sku } });
  return assignment ? fullUpc(sku) : null;
}

module.exports = { createUpcProduct, systemUpcFor };

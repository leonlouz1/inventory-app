const test = require("node:test");
const assert = require("node:assert/strict");

const prisma = require("../src/prismaClient");
const { projectInventory, projectInventoryBatch, checkShortfallBatch } = require("../src/services/projection");

function countQueries() {
  let count = 0;
  prisma.$use(async (params, next) => {
    count++;
    return next(params);
  });
  return () => count;
}

test("projectInventoryBatch issues a constant number of queries regardless of request count", async () => {
  const products = await prisma.product.findMany({ take: 50 });
  const warehouses = await prisma.warehouse.findMany();
  const targetDate = new Date("2026-12-31");

  const requests = [];
  for (const p of products) {
    for (const w of warehouses) {
      requests.push({ sku: p.sku, warehouseId: w.id, targetDate });
    }
  }
  assert.ok(requests.length >= 100, "expect a large batch to exercise the N+1 risk");

  const getCount = countQueries();
  await projectInventoryBatch(requests);
  // Resolving SKUs -> product ids, then stock/restocks/order_lines: 4 queries, flat.
  assert.equal(getCount(), 4);
});

test("projectInventoryBatch results match the single-SKU convenience wrapper", async () => {
  const products = await prisma.product.findMany({ take: 5 });
  const warehouses = await prisma.warehouse.findMany();
  const targetDate = new Date("2026-12-31");

  const requests = products.map((p, i) => ({
    sku: p.sku,
    warehouseId: warehouses[i % warehouses.length].id,
    targetDate,
  }));

  const batched = await projectInventoryBatch(requests);

  for (let i = 0; i < requests.length; i++) {
    const single = await projectInventory(requests[i].sku, requests[i].warehouseId, requests[i].targetDate);
    assert.equal(batched[i], single);
  }
});

test("checkShortfallBatch issues a constant number of queries for many order lines", async () => {
  const orderLines = await prisma.orderLine.findMany({ include: { product: true }, take: 150 });
  assert.ok(orderLines.length > 0, "seed data must include order lines");

  const requests = orderLines.map((line) => ({
    sku: line.product.sku,
    warehouseId: line.warehouseId,
    shipDate: line.shipDate,
  }));

  const getCount = countQueries();
  const results = await checkShortfallBatch(requests);
  assert.equal(getCount(), 4);
  assert.equal(results.length, requests.length);
});

test.after(async () => {
  await prisma.$disconnect();
});

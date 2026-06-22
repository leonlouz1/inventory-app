const prisma = require("../prismaClient");

/**
 * Pure calculation helpers — no I/O, fully unit-testable.
 * "Events" are restocks (positive) and order lines (negative) for a single SKU + warehouse.
 */

function toDateOnly(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Restocks are available on/after their expected_date (>=), i.e. they count
// toward balance once expected_date <= targetDate.
function sumRestocksThrough(restocks, targetDate) {
  const target = toDateOnly(targetDate);
  return restocks
    .filter((r) => toDateOnly(r.expectedDate) <= target)
    .reduce((sum, r) => sum + r.quantity, 0);
}

// Order lines deduct from projected balance once their ship_date <= targetDate.
function sumOrderLinesThrough(orderLines, targetDate) {
  const target = toDateOnly(targetDate);
  return orderLines
    .filter((l) => toDateOnly(l.shipDate) <= target)
    .reduce((sum, l) => sum + l.quantity, 0);
}

/**
 * Projected available balance = on_hand + restocks arrived by targetDate
 * - order lines shipped by targetDate. Negative is a valid result (stockout).
 */
function computeProjectedBalance({ onHand, restocks, orderLines, targetDate }) {
  return onHand + sumRestocksThrough(restocks, targetDate) - sumOrderLinesThrough(orderLines, targetDate);
}

/**
 * Walks every restock/order-line event between today and shipDate (inclusive),
 * in chronological order, tracking a running balance starting from onHand.
 * Returns the first date the balance goes negative (a shortfall "before" ship date),
 * or, if it never goes negative, the final projected balance on shipDate.
 *
 * @returns {{ ok: true, balance: number } | { ok: false, date: Date, deficit: number, balance: number }}
 */
function detectShortfall({ onHand, restocks, orderLines, shipDate }) {
  const target = toDateOnly(shipDate);

  const events = [
    ...restocks
      .filter((r) => toDateOnly(r.expectedDate) <= target)
      .map((r) => ({ date: toDateOnly(r.expectedDate), delta: r.quantity })),
    ...orderLines
      .filter((l) => toDateOnly(l.shipDate) <= target)
      .map((l) => ({ date: toDateOnly(l.shipDate), delta: -l.quantity })),
  ].sort((a, b) => a.date - b.date);

  let balance = onHand;
  for (const event of events) {
    balance += event.delta;
    if (balance < 0) {
      return { ok: false, date: event.date, deficit: -balance, balance };
    }
  }

  return { ok: true, balance };
}

/**
 * Loads everything needed to project any number of SKUs in exactly 4 queries
 * total (1 to resolve SKUs to product ids, 3 for stock/restocks/order lines) —
 * regardless of how many SKUs or order lines are being checked. Callers that
 * need to check many order lines (alerts, timeline, dashboard) MUST batch
 * through this rather than calling projectInventory/checkShortfall in a loop,
 * which would issue 3 queries per line (N+1).
 */
async function loadProjectionData(skus) {
  const uniqueSkus = [...new Set(skus)];
  const products = await prisma.product.findMany({ where: { sku: { in: uniqueSkus } } });

  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const productIds = products.map((p) => p.id);

  const groupByProductId = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const arr = map.get(row.productId);
      if (arr) {
        arr.push(row);
      } else {
        map.set(row.productId, [row]);
      }
    }
    return map;
  };

  const [stock, restocks, orderLines] = await Promise.all([
    prisma.warehouseStock.findMany({ where: { productId: { in: productIds } } }),
    prisma.restock.findMany({ where: { productId: { in: productIds } } }),
    prisma.orderLine.findMany({ where: { productId: { in: productIds } } }),
  ]);

  return {
    productBySku,
    stockByProduct: groupByProductId(stock),
    restocksByProduct: groupByProductId(restocks),
    orderLinesByProduct: groupByProductId(orderLines),
  };
}

// Narrows batch-loaded data down to one SKU (+ optional warehouse) in memory —
// no further DB round trips.
function selectInputs(data, sku, warehouseId) {
  const product = data.productBySku.get(sku);
  if (!product) {
    throw new Error(`Unknown SKU: ${sku}`);
  }

  const filterByWarehouse = (rows) => (warehouseId ? rows.filter((r) => r.warehouseId === warehouseId) : rows);

  const stockRows = filterByWarehouse(data.stockByProduct.get(product.id) || []);
  const restocks = filterByWarehouse(data.restocksByProduct.get(product.id) || []);
  const orderLines = filterByWarehouse(data.orderLinesByProduct.get(product.id) || []);
  const onHand = stockRows.reduce((sum, row) => sum + row.onHand, 0);

  return { product, onHand, restocks, orderLines };
}

/**
 * Batched projection: pass warehouseId = null/undefined per-request for the
 * network-wide total. Issues 4 queries total, no matter how many requests.
 */
async function projectInventoryBatch(requests) {
  const data = await loadProjectionData(requests.map((r) => r.sku));
  return requests.map(({ sku, warehouseId, targetDate }) => {
    const { onHand, restocks, orderLines } = selectInputs(data, sku, warehouseId);
    return computeProjectedBalance({ onHand, restocks, orderLines, targetDate });
  });
}

/**
 * Batched shortfall detection — same query-count guarantee as projectInventoryBatch.
 * Use this for the dashboard alert list and the live per-line check on the new
 * order form (one call covering every line currently in the form).
 */
async function checkShortfallBatch(requests) {
  const data = await loadProjectionData(requests.map((r) => r.sku));
  return requests.map(({ sku, warehouseId, shipDate }) => {
    const { onHand, restocks, orderLines } = selectInputs(data, sku, warehouseId);
    return detectShortfall({ onHand, restocks, orderLines, shipDate });
  });
}

/**
 * projectInventory(sku, warehouseId, targetDate) -> integer
 * Single-SKU convenience wrapper around projectInventoryBatch. Fine for
 * one-off lookups (e.g. GET /api/products/:id/projection); for checking many
 * order lines at once, call projectInventoryBatch directly instead.
 */
async function projectInventory(sku, warehouseId, targetDate) {
  const [balance] = await projectInventoryBatch([{ sku, warehouseId, targetDate }]);
  return balance;
}

/**
 * checkShortfall(sku, warehouseId, shipDate) -> single-SKU convenience
 * wrapper around checkShortfallBatch. See note above about batching.
 */
async function checkShortfall(sku, warehouseId, shipDate) {
  const [result] = await checkShortfallBatch([{ sku, warehouseId, shipDate }]);
  return result;
}

module.exports = {
  // pure functions (unit-testable without the DB)
  toDateOnly,
  computeProjectedBalance,
  detectShortfall,
  sumRestocksThrough,
  sumOrderLinesThrough,
  // batched DB-backed functions — O(1) queries regardless of request count
  loadProjectionData,
  projectInventoryBatch,
  checkShortfallBatch,
  // single-SKU convenience wrappers
  projectInventory,
  checkShortfall,
};

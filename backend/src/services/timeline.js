const prisma = require("../prismaClient");
const { toDateOnly } = require("./projection");

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfMonthUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonthUTC(date) {
  // Day 0 of the following month rolls back to the last day of this month.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

const GRAIN_CONFIG = {
  week: { periodCount: 16 },
  month: { periodCount: 12 },
};

function buildPeriods(grain, today) {
  const { periodCount } = GRAIN_CONFIG[grain];

  if (grain === "week") {
    return Array.from({ length: periodCount }, (_, i) => {
      const start = addDays(today, i * 7);
      return { start, end: addDays(start, 6) };
    });
  }

  const base = startOfMonthUTC(today);
  return Array.from({ length: periodCount }, (_, i) => {
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
    return { start, end: endOfMonthUTC(start) };
  });
}

function sumQuantityInRange(rows, dateField, start, end) {
  return rows
    .filter((row) => {
      const date = toDateOnly(row[dateField]);
      return date >= start && date <= end;
    })
    .reduce((sum, row) => sum + row.quantity, 0);
}

function flagFor(balance, reorderPoint) {
  if (balance < 0) return "shortage";
  if (balance < reorderPoint) return "low";
  return "ok";
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the period-by-period projection grid for one SKU across all warehouses,
 * plus a network (combined) row. Used by both GET /api/products/:id/projection
 * (grain="month") and GET /api/timeline (grain="week"|"month").
 */
async function buildSkuTimeline(sku, grain = "month") {
  const normalizedGrain = grain === "week" ? "week" : "month";
  const today = toDateOnly(new Date());
  const periods = buildPeriods(normalizedGrain, today);

  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    throw new Error(`Unknown SKU: ${sku}`);
  }

  const [warehouses, stock, restocks, orderLines] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: { id: "asc" } }),
    prisma.warehouseStock.findMany({ where: { productId: product.id } }),
    prisma.restock.findMany({ where: { productId: product.id } }),
    prisma.orderLine.findMany({ where: { productId: product.id } }),
  ]);

  const warehouseRows = warehouses.map((warehouse) => {
    const startingOnHand = stock.find((s) => s.warehouseId === warehouse.id)?.onHand ?? 0;
    const warehouseRestocks = restocks.filter((r) => r.warehouseId === warehouse.id);
    const warehouseOrderLines = orderLines.filter((l) => l.warehouseId === warehouse.id);

    const onHandStart = [];
    const restocksIn = [];
    const ordersOut = [];
    const projectedAvailable = [];
    const flags = [];

    let runningBalance = startingOnHand;
    for (const period of periods) {
      onHandStart.push(runningBalance);
      const inQty = sumQuantityInRange(warehouseRestocks, "expectedDate", period.start, period.end);
      const outQty = sumQuantityInRange(warehouseOrderLines, "shipDate", period.start, period.end);
      restocksIn.push(inQty);
      ordersOut.push(outQty);
      runningBalance = runningBalance + inQty - outQty;
      projectedAvailable.push(runningBalance);
      flags.push(flagFor(runningBalance, product.reorderPoint));
    }

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      onHandStart,
      restocksIn,
      ordersOut,
      projectedAvailable,
      flags,
    };
  });

  // Built independently from all order lines/restocks (not by summing the
  // per-warehouse rows above), since order lines with no warehouse assigned
  // belong to no per-warehouse row but must still count network-wide.
  const networkStartingOnHand = stock.reduce((sum, s) => sum + s.onHand, 0);
  const network = {
    onHandStart: [],
    restocksIn: [],
    ordersOut: [],
    projectedAvailable: [],
    flags: [],
  };
  let networkRunningBalance = networkStartingOnHand;
  for (const period of periods) {
    network.onHandStart.push(networkRunningBalance);
    const inQty = sumQuantityInRange(restocks, "expectedDate", period.start, period.end);
    const outQty = sumQuantityInRange(orderLines, "shipDate", period.start, period.end);
    network.restocksIn.push(inQty);
    network.ordersOut.push(outQty);
    networkRunningBalance = networkRunningBalance + inQty - outQty;
    network.projectedAvailable.push(networkRunningBalance);
    network.flags.push(flagFor(networkRunningBalance, product.reorderPoint));
  }

  return {
    sku: product.sku,
    productName: product.name,
    reorderPoint: product.reorderPoint,
    grain: normalizedGrain,
    periods: periods.map((p) => ({ start: isoDate(p.start), end: isoDate(p.end) })),
    warehouses: warehouseRows,
    network,
  };
}

module.exports = { buildSkuTimeline };

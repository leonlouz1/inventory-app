const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeProjectedBalance,
  detectShortfall,
  sumRestocksThrough,
  sumOrderLinesThrough,
} = require("../src/services/projection");

function d(s) {
  return new Date(s + "T00:00:00.000Z");
}

test("sumRestocksThrough only counts restocks on/before targetDate", () => {
  const restocks = [
    { expectedDate: d("2026-01-01"), quantity: 10 },
    { expectedDate: d("2026-02-01"), quantity: 20 },
    { expectedDate: d("2026-03-01"), quantity: 30 },
  ];
  assert.equal(sumRestocksThrough(restocks, d("2026-02-01")), 30);
  assert.equal(sumRestocksThrough(restocks, d("2026-01-15")), 10);
  assert.equal(sumRestocksThrough(restocks, d("2025-12-31")), 0);
});

test("sumOrderLinesThrough only counts order lines on/before targetDate", () => {
  const orderLines = [
    { shipDate: d("2026-01-01"), quantity: 5 },
    { shipDate: d("2026-02-01"), quantity: 15 },
  ];
  assert.equal(sumOrderLinesThrough(orderLines, d("2026-01-01")), 5);
  assert.equal(sumOrderLinesThrough(orderLines, d("2026-02-01")), 20);
});

test("computeProjectedBalance: on_hand + restocks - orders", () => {
  const balance = computeProjectedBalance({
    onHand: 100,
    restocks: [{ expectedDate: d("2026-01-10"), quantity: 50 }],
    orderLines: [{ shipDate: d("2026-01-15"), quantity: 30 }],
    targetDate: d("2026-01-20"),
  });
  assert.equal(balance, 100 + 50 - 30);
});

test("computeProjectedBalance ignores events after targetDate", () => {
  const balance = computeProjectedBalance({
    onHand: 100,
    restocks: [{ expectedDate: d("2026-02-01"), quantity: 50 }],
    orderLines: [{ shipDate: d("2026-02-01"), quantity: 30 }],
    targetDate: d("2026-01-15"),
  });
  assert.equal(balance, 100);
});

test("computeProjectedBalance allows negative balances (stockout)", () => {
  const balance = computeProjectedBalance({
    onHand: 10,
    restocks: [],
    orderLines: [{ shipDate: d("2026-01-05"), quantity: 50 }],
    targetDate: d("2026-01-10"),
  });
  assert.equal(balance, -40);
});

test("detectShortfall returns OK with projected balance when never negative", () => {
  const result = detectShortfall({
    onHand: 100,
    restocks: [{ expectedDate: d("2026-01-10"), quantity: 20 }],
    orderLines: [{ shipDate: d("2026-01-20"), quantity: 50 }],
    shipDate: d("2026-01-20"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.balance, 70);
});

test("detectShortfall finds the exact event date where balance first goes negative", () => {
  // on_hand 30, order ships 50 on Jan 5 (-> -20), restock of 40 arrives Jan 10 (-> +20)
  const result = detectShortfall({
    onHand: 30,
    restocks: [{ expectedDate: d("2026-01-10"), quantity: 40 }],
    orderLines: [{ shipDate: d("2026-01-05"), quantity: 50 }],
    shipDate: d("2026-01-15"),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.date, d("2026-01-05"));
  assert.equal(result.deficit, 20);
});

test("detectShortfall walks multiple events in chronological order, not insertion order", () => {
  const result = detectShortfall({
    onHand: 50,
    restocks: [{ expectedDate: d("2026-01-20"), quantity: 100 }],
    orderLines: [
      { shipDate: d("2026-01-15"), quantity: 30 }, // balance 20, ok
      { shipDate: d("2026-01-10"), quantity: 40 }, // balance -... should run first chronologically
    ],
    shipDate: d("2026-01-25"),
  });
  // Chronological: Jan 10 (-40) -> balance 10; Jan 15 (-30) -> balance -20 (shortfall here); Jan 20 (+100) -> balance 80
  assert.equal(result.ok, false);
  assert.deepEqual(result.date, d("2026-01-15"));
  assert.equal(result.deficit, 20);
});

test("detectShortfall with no events returns OK with on_hand as balance", () => {
  const result = detectShortfall({
    onHand: 15,
    restocks: [],
    orderLines: [],
    shipDate: d("2026-06-01"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.balance, 15);
});

test("restock available on its expected_date, not before (boundary check)", () => {
  const balance = computeProjectedBalance({
    onHand: 0,
    restocks: [{ expectedDate: d("2026-01-10"), quantity: 25 }],
    orderLines: [],
    targetDate: d("2026-01-10"),
  });
  assert.equal(balance, 25);

  const balanceBefore = computeProjectedBalance({
    onHand: 0,
    restocks: [{ expectedDate: d("2026-01-10"), quantity: 25 }],
    orderLines: [],
    targetDate: d("2026-01-09"),
  });
  assert.equal(balanceBefore, 0);
});

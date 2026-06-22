const test = require("node:test");
const assert = require("node:assert/strict");

const { computeProjectedBalance } = require("../src/services/projection");

function d(s) {
  return new Date(s + "T00:00:00.000Z");
}

test("unassigned order line (warehouseId null) is excluded from a specific warehouse's projection", () => {
  // Caller is responsible for pre-filtering orderLines by warehouseId before calling
  // computeProjectedBalance (this is what selectInputs in projection.js does). Simulate
  // that filter here to document the expected behavior for null warehouseId lines.
  const orderLines = [
    { warehouseId: 1, shipDate: d("2026-01-05"), quantity: 50 },
    { warehouseId: null, shipDate: d("2026-01-05"), quantity: 30 },
  ];

  const warehouse1Lines = orderLines.filter((l) => l.warehouseId === 1);
  const balanceAtWarehouse1 = computeProjectedBalance({
    onHand: 100,
    restocks: [],
    orderLines: warehouse1Lines,
    targetDate: d("2026-01-10"),
  });
  assert.equal(balanceAtWarehouse1, 50); // only the assigned line counted

  // Network-wide: no warehouse filter applied, so the unassigned line still counts
  // against total company-wide commitments.
  const balanceNetwork = computeProjectedBalance({
    onHand: 100,
    restocks: [],
    orderLines,
    targetDate: d("2026-01-10"),
  });
  assert.equal(balanceNetwork, 20); // 100 - 50 - 30
});

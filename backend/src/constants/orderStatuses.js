// Statuses that still represent a real, uncommitted-but-expected future
// shipment: they reserve inventory in projections/Available to Sell, but
// haven't actually left the warehouse yet (no on-hand stock movement).
const PENDING_STATUSES = ["CONFIRMED", "ROUTED"];

const ORDER_STATUSES = ["DRAFT", "CONFIRMED", "ROUTED", "SHIPPED", "CANCELLED"];

module.exports = { ORDER_STATUSES, PENDING_STATUSES };

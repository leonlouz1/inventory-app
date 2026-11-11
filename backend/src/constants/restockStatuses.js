// Restock statuses that do NOT count as stock on its way in:
// - DRAFT: not a real order yet
// - ON_HOLD: paused, so it isn't arriving until it's taken off hold
// - RECEIVED: already counted in on-hand stock
// Use this everywhere "incoming" or "arriving" quantities are worked out.
const NOT_INCOMING_RESTOCK_STATUSES = ["DRAFT", "ON_HOLD", "RECEIVED"];

module.exports = { NOT_INCOMING_RESTOCK_STATUSES };

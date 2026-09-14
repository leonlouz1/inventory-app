// Stock is now applied only when a restock is manually set to RECEIVED status
// via PATCH /api/restocks/:id/status. This function is kept as a no-op so
// existing callers don't need to be updated.
async function applyPendingRestocks() {}

module.exports = { applyPendingRestocks };

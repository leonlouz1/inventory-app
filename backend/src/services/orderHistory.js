// Order change history. Each entry records what changed on an order or one of
// its lines (before -> after), who did it and when.

// Who made a change: the signed-in person, or the system for automatic changes
function actor(req) {
  return req?.userId ? { userId: req.userId, userName: req.userName || null } : { userId: null, userName: "System" };
}

const str = (v) => (v == null || v === "" ? null : String(v));

// entries: { orderId, lineId?, sku?, field, before?, after?, note? } or a list of them.
// Entries whose before and after are the same are skipped.
async function logOrderChanges(db, req, entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).filter(
    (e) => e && (e.before === undefined || str(e.before) !== str(e.after))
  );
  if (!list.length) return;
  const who = actor(req);
  await db.orderChange.createMany({
    data: list.map((e) => ({
      orderId: e.orderId,
      lineId: e.lineId ?? null,
      sku: e.sku ?? null,
      field: e.field,
      before: str(e.before),
      after: str(e.after),
      note: e.note ?? null,
      ...who,
    })),
  });
}

module.exports = { logOrderChanges };

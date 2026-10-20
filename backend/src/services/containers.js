// Containers group incoming restock lines. The container's ETA, warehouse,
// supplier and status are copied onto each line (Restock row) so everything
// that reads restocks (projections, timeline, product pages) keeps working.

const CONTAINER_STATUSES = ["DRAFT", "ON_HOLD", "IN_PRODUCTION", "EN_ROUTE", "RECEIVED"];

function isoDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

function lineView(l) {
  const received = l.receivedQuantity;
  return {
    id: l.id,
    productId: l.productId,
    sku: l.product.sku,
    productName: l.product.name,
    casePack: l.product.casePack,
    warehouseId: l.warehouseId,
    warehouseName: l.warehouse?.name ?? null,
    orderedQuantity: l.quantity,
    receivedQuantity: received,
    difference: received == null ? null : received - l.quantity,
    status: l.status,
    linkedOrderId: l.linkedOrderId,
    linkedOrderNumber: l.linkedOrder?.orderNumber ?? null,
  };
}

function containerView(c) {
  const lines = (c.lines || []).map(lineView);
  const ordered = lines.reduce((s, l) => s + l.orderedQuantity, 0);
  const receivedLines = lines.filter((l) => l.receivedQuantity != null);
  const received = receivedLines.length ? receivedLines.reduce((s, l) => s + l.receivedQuantity, 0) : null;
  return {
    id: c.id,
    containerNumber: c.containerNumber,
    poNumber: c.poNumber,
    supplier: c.supplier,
    warehouseId: c.warehouseId,
    warehouseName: c.warehouse?.name ?? null,
    etd: isoDate(c.etd),
    eta: isoDate(c.eta),
    blNumber: c.blNumber,
    notes: c.notes,
    status: c.status,
    receivedAt: c.receivedAt ? c.receivedAt.toISOString() : null,
    skuCount: lines.length,
    orderedUnits: ordered,
    receivedUnits: received,
    difference: received == null ? null : received - receivedLines.reduce((s, l) => s + l.orderedQuantity, 0),
    linesShortOrOver: receivedLines.filter((l) => l.difference !== 0).length,
    lines,
  };
}

const CONTAINER_INCLUDE = {
  warehouse: true,
  lines: { include: { product: true, warehouse: true, linkedOrder: true }, orderBy: { id: "asc" } },
};

// Copy the container's shared details onto its lines that haven't been received
async function syncLines(tx, container) {
  await tx.restock.updateMany({
    where: { containerId: container.id, status: { not: "RECEIVED" } },
    data: {
      expectedDate: container.eta,
      warehouseId: container.warehouseId,
      supplier: container.supplier,
      ...(container.status !== "RECEIVED" && { status: container.status }),
    },
  });
}

// Receive a container: each line gets its received quantity (defaults to what
// was ordered), that quantity is added to stock, and the difference is kept.
async function receiveContainer(tx, containerId, receivedByLine) {
  const container = await tx.container.findUnique({ where: { id: containerId }, include: { lines: true } });
  if (!container) throw Object.assign(new Error("Container not found"), { status: 404 });
  const now = new Date();
  for (const line of container.lines) {
    if (line.status === "RECEIVED") continue;
    const qty = receivedByLine.has(line.id) ? receivedByLine.get(line.id) : line.quantity;
    if (!Number.isInteger(qty) || qty < 0) {
      throw Object.assign(new Error("Received quantities must be whole numbers, 0 or more"), { status: 400 });
    }
    await tx.warehouseStock.upsert({
      where: { productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId } },
      update: { onHand: { increment: qty } },
      create: { productId: line.productId, warehouseId: line.warehouseId, onHand: qty },
    });
    await tx.restock.update({
      where: { id: line.id },
      data: { status: "RECEIVED", receivedQuantity: qty, receivedAt: now },
    });
  }
  await tx.container.update({ where: { id: containerId }, data: { status: "RECEIVED", receivedAt: now } });
}

// Undo a receipt (e.g. received by mistake): takes the received quantities
// back out of stock and returns the container to En Route.
async function unreceiveContainer(tx, containerId) {
  const container = await tx.container.findUnique({ where: { id: containerId }, include: { lines: true } });
  if (!container) throw Object.assign(new Error("Container not found"), { status: 404 });
  for (const line of container.lines) {
    if (line.status !== "RECEIVED") continue;
    const qty = line.receivedQuantity ?? line.quantity;
    await tx.warehouseStock.update({
      where: { productId_warehouseId: { productId: line.productId, warehouseId: line.warehouseId } },
      data: { onHand: { decrement: qty } },
    });
    await tx.restock.update({
      where: { id: line.id },
      data: { status: "EN_ROUTE", receivedQuantity: null, receivedAt: null },
    });
  }
  await tx.container.update({ where: { id: containerId }, data: { status: "EN_ROUTE", receivedAt: null } });
}

// One-time, when containers are introduced: restock lines logged together
// (same shipmentId) become one container, every other line its own container.
// Nothing about the lines' stock changes; already-received lines are recorded
// as received in full, since that is what was added to stock.
async function moveRestocksIntoContainers(prisma) {
  const restocks = await prisma.restock.findMany({ where: { containerId: null }, orderBy: [{ expectedDate: "asc" }, { id: "asc" }] });
  const groups = new Map();
  for (const r of restocks) {
    const key = r.shipmentId || `single-${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const lines of groups.values()) {
    const first = lines[0];
    const statuses = [...new Set(lines.map((l) => l.status))];
    const status = statuses.length === 1 ? statuses[0] : statuses.includes("EN_ROUTE") ? "EN_ROUTE" : "IN_PRODUCTION";
    const received = lines.filter((l) => l.receivedAt);
    const container = await prisma.container.create({
      data: {
        supplier: first.supplier,
        warehouseId: first.warehouseId,
        eta: first.expectedDate,
        status,
        receivedAt: status === "RECEIVED" ? received[0]?.receivedAt ?? first.createdAt : null,
        notes: first.notes,
      },
    });
    await prisma.restock.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { containerId: container.id } });
  }
  // Received lines: received = ordered (column-to-column copy)
  await prisma.$executeRaw`UPDATE "restocks" SET "received_quantity" = "quantity" WHERE "status" = 'RECEIVED' AND "received_quantity" IS NULL`;
  if (groups.size) console.log(`Put ${restocks.length} restock lines into ${groups.size} containers`);
}

module.exports = {
  CONTAINER_STATUSES,
  CONTAINER_INCLUDE,
  containerView,
  syncLines,
  receiveContainer,
  unreceiveContainer,
  moveRestocksIntoContainers,
};

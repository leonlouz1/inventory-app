const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");

const router = Router();
const prisma = new PrismaClient();

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const STATUSES = ["Active", "Order Placed", "Warm", "Not Contacted", "No Response", "Not Interested", "No Contact Found", "N/A"];

function isoDate(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

function serializeRetailer(r, includeRelations = false) {
  const base = {
    id: r.id,
    name: r.name,
    type: r.type,
    priority: r.priority,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    categories: (r.categories || []).map((c) => ({
      id: c.id,
      category: c.category,
      buyerName: c.buyerName,
      status: c.status,
    })),
  };
  if (includeRelations) {
    base.contacts = (r.contacts || []).map(serializeContact);
    base.activityLogs = (r.activityLogs || []).map(serializeActivity);
    base.sentItems = (r.sentItems || []).map(serializeSentItem);
  }
  return base;
}

function serializeContact(c) {
  return {
    id: c.id,
    retailerId: c.retailerId,
    name: c.name,
    title: c.title,
    email: c.email,
    directPhone: c.directPhone,
    mobilePhone: c.mobilePhone,
    hqPhone: c.hqPhone,
    category: c.category,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
  };
}

function serializeActivity(a) {
  return {
    id: a.id,
    retailerId: a.retailerId,
    retailerName: a.retailer?.name ?? null,
    category: a.category,
    rep: a.rep,
    date: isoDate(a.date),
    actionTaken: a.actionTaken,
    notes: a.notes,
    nextStep: a.nextStep,
    nextStepDate: isoDate(a.nextStepDate),
    done: a.done,
    createdAt: a.createdAt.toISOString(),
  };
}

function serializeSentItem(s) {
  return {
    id: s.id,
    retailerId: s.retailerId,
    retailerName: s.retailer?.name ?? null,
    category: s.category,
    buyerName: s.buyerName,
    dateSent: isoDate(s.dateSent),
    itemSent: s.itemSent,
    notes: s.notes,
    responseReceived: s.responseReceived,
    followUpDate: isoDate(s.followUpDate),
    done: s.done,
    createdAt: s.createdAt.toISOString(),
  };
}

// ─── RETAILERS ───────────────────────────────────────────────────────────────

// GET /api/crm/active-customers — retailers with at least one Active or Order Placed category
router.get("/active-customers", async (req, res) => {
  try {
    const retailers = await prisma.retailer.findMany({
      where: {
        categories: {
          some: { status: { in: ["Active", "Order Placed"] } },
        },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.json(retailers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/retailers
router.get("/retailers", async (req, res) => {
  try {
    const retailers = await prisma.retailer.findMany({
      include: { categories: true },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
    res.json(retailers.map((r) => serializeRetailer(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/retailers/:id
router.get("/retailers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await prisma.retailer.findUnique({
      where: { id },
      include: {
        categories: true,
        contacts: { orderBy: { category: "asc" } },
        activityLogs: { orderBy: { date: "desc" } },
        sentItems: { orderBy: { dateSent: "desc" } },
      },
    });
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json(serializeRetailer(r, true));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/retailers
router.post("/retailers", async (req, res) => {
  try {
    const { name, type, priority, notes, categories } = req.body;
    const retailer = await prisma.retailer.create({
      data: {
        name,
        type: type || null,
        priority: priority || "1 - Low",
        notes: notes || null,
        categories: {
          create: (categories || CRM_CATEGORIES.map((c) => ({ category: c, status: "Not Contacted" }))),
        },
      },
      include: { categories: true },
    });
    res.status(201).json(serializeRetailer(retailer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/crm/retailers/:id
router.put("/retailers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, type, priority, notes } = req.body;
    const retailer = await prisma.retailer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type: type || null }),
        ...(priority !== undefined && { priority }),
        ...(notes !== undefined && { notes: notes || null }),
      },
      include: { categories: true },
    });
    res.json(serializeRetailer(retailer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/crm/retailers/:id
router.delete("/retailers/:id", async (req, res) => {
  try {
    await prisma.retailer.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/crm/retailers/:id/categories — update buyer/status for one or more categories
router.patch("/retailers/:id/categories", async (req, res) => {
  try {
    const retailerId = Number(req.params.id);
    const { category, buyerName, status } = req.body;
    const cat = await prisma.retailerCategory.upsert({
      where: { retailerId_category: { retailerId, category } },
      update: {
        ...(buyerName !== undefined && { buyerName: buyerName || null }),
        ...(status !== undefined && { status }),
      },
      create: { retailerId, category, buyerName: buyerName || null, status: status || "Not Contacted" },
    });
    res.json({ id: cat.id, category: cat.category, buyerName: cat.buyerName, status: cat.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CONTACTS ────────────────────────────────────────────────────────────────

// GET /api/crm/contacts?retailerId=
router.get("/contacts", async (req, res) => {
  try {
    const where = req.query.retailerId ? { retailerId: Number(req.query.retailerId) } : {};
    const contacts = await prisma.crmContact.findMany({
      where,
      include: { retailer: true },
      orderBy: [{ retailer: { name: "asc" } }, { category: "asc" }, { name: "asc" }],
    });
    res.json(contacts.map((c) => ({ ...serializeContact(c), retailerName: c.retailer.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/contacts
router.post("/contacts", async (req, res) => {
  try {
    const { retailerId, name, title, email, directPhone, mobilePhone, hqPhone, category, notes } = req.body;
    const contact = await prisma.crmContact.create({
      data: {
        retailerId: Number(retailerId),
        name,
        title: title || null,
        email: email || null,
        directPhone: directPhone || null,
        mobilePhone: mobilePhone || null,
        hqPhone: hqPhone || null,
        category: category || null,
        notes: notes || null,
      },
    });
    res.status(201).json(serializeContact(contact));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/crm/contacts/:id
router.put("/contacts/:id", async (req, res) => {
  try {
    const { name, title, email, directPhone, mobilePhone, hqPhone, category, notes } = req.body;
    const contact = await prisma.crmContact.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(title !== undefined && { title: title || null }),
        ...(email !== undefined && { email: email || null }),
        ...(directPhone !== undefined && { directPhone: directPhone || null }),
        ...(mobilePhone !== undefined && { mobilePhone: mobilePhone || null }),
        ...(hqPhone !== undefined && { hqPhone: hqPhone || null }),
        ...(category !== undefined && { category: category || null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    });
    res.json(serializeContact(contact));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/crm/contacts/:id
router.delete("/contacts/:id", async (req, res) => {
  try {
    await prisma.crmContact.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ACTIVITY LOG ────────────────────────────────────────────────────────────

// GET /api/crm/activity?retailerId=&done=
router.get("/activity", async (req, res) => {
  try {
    const where = {};
    if (req.query.retailerId) where.retailerId = Number(req.query.retailerId);
    if (req.query.done === "false") where.done = false;
    if (req.query.done === "true") where.done = true;
    const logs = await prisma.activityLog.findMany({
      where,
      include: { retailer: true },
      orderBy: { date: "desc" },
      take: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(logs.map(serializeActivity));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/activity
router.post("/activity", async (req, res) => {
  try {
    const { retailerId, category, rep, date, actionTaken, notes, nextStep, nextStepDate } = req.body;
    const log = await prisma.activityLog.create({
      data: {
        retailerId: Number(retailerId),
        category: category || null,
        rep: rep || null,
        date: new Date(date),
        actionTaken,
        notes: notes || null,
        nextStep: nextStep || null,
        nextStepDate: nextStepDate ? new Date(nextStepDate) : null,
      },
      include: { retailer: true },
    });
    res.status(201).json(serializeActivity(log));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/crm/activity/:id
router.put("/activity/:id", async (req, res) => {
  try {
    const { category, rep, date, actionTaken, notes, nextStep, nextStepDate, done } = req.body;
    const log = await prisma.activityLog.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(category !== undefined && { category: category || null }),
        ...(rep !== undefined && { rep: rep || null }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(actionTaken !== undefined && { actionTaken }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(nextStep !== undefined && { nextStep: nextStep || null }),
        ...(nextStepDate !== undefined && { nextStepDate: nextStepDate ? new Date(nextStepDate) : null }),
        ...(done !== undefined && { done }),
      },
      include: { retailer: true },
    });
    res.json(serializeActivity(log));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/crm/activity/:id
router.delete("/activity/:id", async (req, res) => {
  try {
    await prisma.activityLog.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SENT TRACKER ────────────────────────────────────────────────────────────

// GET /api/crm/sent?retailerId=
router.get("/sent", async (req, res) => {
  try {
    const where = {};
    if (req.query.retailerId) where.retailerId = Number(req.query.retailerId);
    if (req.query.done === "false") where.done = false;
    const items = await prisma.sentItem.findMany({
      where,
      include: { retailer: true },
      orderBy: { dateSent: "desc" },
      take: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(items.map(serializeSentItem));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/sent
router.post("/sent", async (req, res) => {
  try {
    const { retailerId, category, buyerName, dateSent, itemSent, notes, responseReceived, followUpDate } = req.body;
    const item = await prisma.sentItem.create({
      data: {
        retailerId: Number(retailerId),
        category: category || null,
        buyerName: buyerName || null,
        dateSent: new Date(dateSent),
        itemSent,
        notes: notes || null,
        responseReceived: responseReceived || null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
      },
      include: { retailer: true },
    });
    res.status(201).json(serializeSentItem(item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/crm/sent/:id
router.put("/sent/:id", async (req, res) => {
  try {
    const { category, buyerName, dateSent, itemSent, notes, responseReceived, followUpDate, done } = req.body;
    const item = await prisma.sentItem.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(category !== undefined && { category: category || null }),
        ...(buyerName !== undefined && { buyerName: buyerName || null }),
        ...(dateSent !== undefined && { dateSent: new Date(dateSent) }),
        ...(itemSent !== undefined && { itemSent }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(responseReceived !== undefined && { responseReceived: responseReceived || null }),
        ...(followUpDate !== undefined && { followUpDate: followUpDate ? new Date(followUpDate) : null }),
        ...(done !== undefined && { done }),
      },
      include: { retailer: true },
    });
    res.json(serializeSentItem(item));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/crm/sent/:id
router.delete("/sent/:id", async (req, res) => {
  try {
    await prisma.sentItem.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

// GET /api/crm/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [retailers, allCategories, overdueActivity, recentSent] = await Promise.all([
      prisma.retailer.findMany({ include: { categories: true } }),
      prisma.retailerCategory.findMany(),
      prisma.activityLog.findMany({
        where: { done: false, nextStepDate: { lt: today } },
        include: { retailer: true },
        orderBy: { nextStepDate: "asc" },
      }),
      prisma.sentItem.findMany({
        include: { retailer: true },
        orderBy: { dateSent: "desc" },
        take: 20,
      }),
    ]);

    // Status counts (per retailer-category pair)
    const statusCounts = {};
    for (const cat of allCategories) {
      if (cat.status === "N/A") continue;
      statusCounts[cat.status] = (statusCounts[cat.status] || 0) + 1;
    }

    // Top priority = High priority retailers with Active/Warm/Order Placed categories
    const topPriority = [];
    for (const r of retailers.filter((r) => r.priority === "3 - High")) {
      for (const c of r.categories) {
        if (["Active", "Order Placed", "Warm"].includes(c.status)) {
          topPriority.push({ retailer: r.name, category: c.category, buyer: c.buyerName, status: c.status });
        }
      }
    }

    // Not touched in 30+ days = retailer-category combos with no activity in 30 days
    const recentlyActive = await prisma.activityLog.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      select: { retailerId: true, category: true },
    });
    const touchedSet = new Set(recentlyActive.map((a) => `${a.retailerId}-${a.category}`));
    const notTouched = [];
    for (const r of retailers) {
      for (const c of r.categories) {
        if (c.status === "N/A" || c.status === "Not Contacted") continue;
        if (!touchedSet.has(`${r.id}-${c.category}`)) {
          notTouched.push({ retailer: r.name, category: c.category, buyer: c.buyerName, lastLogged: null });
        }
      }
    }

    res.json({
      statusCounts,
      totalAccounts: retailers.length,
      topPriority,
      notTouched: notTouched.slice(0, 20),
      overdueActivity: overdueActivity.map(serializeActivity),
      recentSent: recentSent.map(serializeSentItem),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RETAILER TYPES ──────────────────────────────────────────────────────────

const DEFAULT_TYPES = [
  "Off-Price", "Department Store", "Airport Retail", "Furniture", "Ecommerce",
  "Farm Store", "Promotional", "Sporting Goods", "Grocery", "Drug Store",
  "Club", "Hardware", "Supermarket", "Other",
];

// GET /api/crm/retailer-types — returns sorted list, seeds defaults if empty
router.get("/retailer-types", async (req, res) => {
  try {
    let types = await prisma.retailerType.findMany({ orderBy: { name: "asc" } });
    if (types.length === 0) {
      await prisma.retailerType.createMany({
        data: DEFAULT_TYPES.map((name) => ({ name })),
        skipDuplicates: true,
      });
      types = await prisma.retailerType.findMany({ orderBy: { name: "asc" } });
    }
    res.json(types.map((t) => ({ id: t.id, name: t.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/retailer-types
router.post("/retailer-types", async (req, res) => {
  try {
    const { name } = req.body;
    const type = await prisma.retailerType.create({ data: { name: name.trim() } });
    res.status(201).json({ id: type.id, name: type.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/crm/retailer-types/:id
router.put("/retailer-types/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const type = await prisma.retailerType.update({
      where: { id: Number(req.params.id) },
      data: { name: name.trim() },
    });
    res.json({ id: type.id, name: type.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/crm/retailer-types/:id
router.delete("/retailer-types/:id", async (req, res) => {
  try {
    await prisma.retailerType.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

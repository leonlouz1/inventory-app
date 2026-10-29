const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");

const router = Router();
const prisma = new PrismaClient();

const {
  CONTACT_CATEGORIES, CONTACT_ROLES, STATUSES, LOG_ACTIONS, ALL_ACTIONS, statusAfter,
} = require("../constants/crm");
const { importRows } = require("../services/crmImport");
const { todayNY } = require("../services/reminders");

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
    archived: r.archived,
    notes: r.notes,
    billingAddress: r.billingAddress || null,
    billingCity: r.billingCity || null,
    billingState: r.billingState || null,
    billingZip: r.billingZip || null,
    createdAt: r.createdAt.toISOString(),
    categories: categoriesFromContacts(r.contacts || []),
  };
  if (includeRelations) {
    base.contacts = (r.contacts || []).map(serializeContact);
    base.activityLogs = (r.activityLogs || []).map(serializeActivity);
  }
  return base;
}

// Buyers and status per category, worked out from the retailer's contacts.
// latest(contactId, category), when given, adds each buyer's latest entry.
function categoriesFromContacts(contacts, latest) {
  const byCat = new Map();
  for (const c of contacts) {
    if (c.role !== "Buyer") continue;
    for (const cat of c.categories || []) {
      if (cat === "Other") continue;
      if (!byCat.has(cat)) byCat.set(cat, { category: cat, buyers: [] });
      byCat.get(cat).buyers.push({
        id: c.id, name: c.name, status: c.status, nextFollowUp: isoDate(c.nextFollowUp),
        ...(latest && { lastActivity: latest(c.id, cat) }),
      });
    }
  }
  return [...byCat.values()].map((c) => ({
    ...c,
    buyerName: c.buyers.map((b) => b.name).join(", "),
    // most advanced status among the category's buyers
    status: c.buyers.map((b) => b.status).sort((a, b) => STATUSES.indexOf(a) - STATUSES.indexOf(b))[0],
  }));
}

function serializeContact(c) {
  return {
    id: c.id,
    retailerId: c.retailerId,
    retailerName: c.retailer?.name ?? undefined,
    retailerArchived: c.retailer?.archived ?? undefined,
    name: c.name,
    title: c.title,
    role: c.role,
    categories: c.categories || [],
    hiddenCategories: c.hiddenCategories || [],
    activeCategories: c.activeCategories || [],
    status: c.status,
    nextFollowUp: isoDate(c.nextFollowUp),
    email: c.email,
    directPhone: c.directPhone,
    mobilePhone: c.mobilePhone,
    hqPhone: c.hqPhone,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
  };
}

function cleanList(list, allowed) {
  return [...new Set((Array.isArray(list) ? list : []).filter((v) => allowed.includes(v)))];
}

// Latest history entry per contact. With a category, an entry for that
// category (or for no category) wins over a newer one for another category.
async function latestActivity(contactIds, category) {
  if (!contactIds.length) return new Map();
  const logs = await prisma.activityLog.findMany({
    where: { contactId: { in: contactIds } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const latest = new Map();
  for (const l of logs) {
    const cur = latest.get(l.contactId);
    const fits = !category || !l.category || l.category === category;
    if (!cur || (fits && !cur.fits)) latest.set(l.contactId, { fits, log: l });
  }
  return new Map([...latest].map(([id, { log }]) => [id, serializeActivity(log)]));
}

function serializeActivity(a) {
  return {
    id: a.id,
    retailerId: a.retailerId,
    retailerName: a.retailer?.name ?? null,
    contactId: a.contactId,
    contactName: a.contact?.name ?? null,
    ccContactIds: a.ccContactIds || [],
    category: a.category,
    rep: a.rep,
    date: isoDate(a.date),
    actionTaken: a.actionTaken,
    notes: a.notes,
    recap: a.recap ?? null,
    attachments: (a.attachments || []).map((f) => ({ id: f.id, filename: f.filename, contentType: f.contentType, size: f.size })),
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

// GET /api/crm/active-customers — retailers with an Active / Order Placed buyer,
// plus any retailer that already has orders
router.get("/active-customers", async (req, res) => {
  try {
    const orderCustomers = await prisma.order.findMany({ distinct: ["customer"], select: { customer: true } });
    const retailers = await prisma.retailer.findMany({
      where: {
        OR: [
          { contacts: { some: { status: { in: ["Active", "Order Placed"] } } } },
          { name: { in: orderCustomers.map((o) => o.customer) } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.json(retailers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/crm/retailers?archived=true|all — active only by default
router.get("/retailers", async (req, res) => {
  try {
    const where = req.query.archived === "all" ? {} : { archived: req.query.archived === "true" };
    const retailers = await prisma.retailer.findMany({
      where,
      include: {
        contacts: { orderBy: { createdAt: "asc" } },
        activityLogs: { orderBy: { date: "desc" }, take: 1 },
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
    });
    // Latest entry per buyer per category, for the grid's Notes columns
    const buyerIds = retailers.flatMap((r) => r.contacts.filter((c) => c.role === "Buyer").map((c) => c.id));
    const logs = buyerIds.length
      ? await prisma.activityLog.findMany({
        where: { contactId: { in: buyerIds } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      })
      : [];
    const logsByContact = new Map();
    for (const l of logs) {
      if (!logsByContact.has(l.contactId)) logsByContact.set(l.contactId, []);
      logsByContact.get(l.contactId).push(l);
    }
    const latest = (contactId, cat) => {
      const log = (logsByContact.get(contactId) || []).find((l) => !l.category || l.category === cat);
      return log ? serializeActivity(log) : null;
    };
    res.json(retailers.map((r) => {
      const base = serializeRetailer(r);
      base.categories = categoriesFromContacts(r.contacts || [], latest);
      base.contacts = (r.contacts || []).map(serializeContact);
      base.lastContactDate = r.activityLogs?.[0]?.date ? isoDate(r.activityLogs[0].date) : null;
      return base;
    }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/crm/retailers/unarchive — { ids } restores several at once
router.post("/retailers/unarchive", async (req, res) => {
  try {
    const ids = (req.body.ids || []).map(Number).filter(Boolean);
    const { count } = await prisma.retailer.updateMany({ where: { id: { in: ids } }, data: { archived: false } });
    res.json({ restored: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/crm/retailers/:id/archive
router.patch("/retailers/:id/archive", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { archived } = req.body;
    const retailer = await prisma.retailer.update({ where: { id }, data: { archived: !!archived } });
    res.json({ id: retailer.id, archived: retailer.archived });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/crm/retailers/:id
router.get("/retailers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await prisma.retailer.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { name: "asc" } },
        activityLogs: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { contact: true } },
      },
    });
    if (!r) return res.status(404).json({ message: "Not found" });
    const out = serializeRetailer(r, true);
    const latest = await latestActivity(r.contacts.map((c) => c.id));
    out.contacts = out.contacts.map((c) => ({ ...c, lastActivity: latest.get(c.id) || null }));
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function retailerError(res, err, name) {
  if (err.code === "P2002") {
    return res.status(409).json({ message: `${name ? `"${String(name).trim()}"` : "That retailer"} already exists — find it on the Retailers page` });
  }
  return res.status(500).json({ message: err.message });
}

// POST /api/crm/retailers
router.post("/retailers", async (req, res) => {
  try {
    const { name, type, priority, notes } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: "Company name is required" });
    const retailer = await prisma.retailer.create({
      data: {
        name,
        type: type || null,
        priority: priority || "1 - Low",
        notes: notes || null,
      },
    });
    res.status(201).json(serializeRetailer(retailer));
  } catch (err) {
    retailerError(res, err, req.body.name);
  }
});

// PUT /api/crm/retailers/:id
router.put("/retailers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, type, priority, notes, billingAddress, billingCity, billingState, billingZip } = req.body;
    const retailer = await prisma.retailer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type: type || null }),
        ...(priority !== undefined && { priority }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(billingAddress !== undefined && { billingAddress: billingAddress || null }),
        ...(billingCity !== undefined && { billingCity: billingCity || null }),
        ...(billingState !== undefined && { billingState: billingState || null }),
        ...(billingZip !== undefined && { billingZip: billingZip || null }),
      },
    });
    res.json(serializeRetailer(retailer));
  } catch (err) {
    retailerError(res, err, req.body.name);
  }
});

// DELETE /api/crm/retailers/:id
router.delete("/retailers/:id", async (req, res) => {
  try {
    await prisma.retailer.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── CONTACTS ────────────────────────────────────────────────────────────────

function contactData(body) {
  const { name, title, email, directPhone, mobilePhone, hqPhone, notes, role, categories, status, nextFollowUp } = body;
  return {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(title !== undefined && { title: title || null }),
    ...(email !== undefined && { email: email || null }),
    ...(directPhone !== undefined && { directPhone: directPhone || null }),
    ...(mobilePhone !== undefined && { mobilePhone: mobilePhone || null }),
    ...(hqPhone !== undefined && { hqPhone: hqPhone || null }),
    ...(notes !== undefined && { notes: notes || null }),
    ...(role !== undefined && CONTACT_ROLES.includes(role) && { role }),
    ...(categories !== undefined && { categories: cleanList(categories, CONTACT_CATEGORIES) }),
    ...(status !== undefined && STATUSES.includes(status) && { status }),
    ...(nextFollowUp !== undefined && { nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : null }),
  };
}

// GET /api/crm/contacts?retailerId=&category=&role= — every contact with their latest entry
router.get("/contacts", async (req, res) => {
  try {
    const where = {};
    if (req.query.retailerId) where.retailerId = Number(req.query.retailerId);
    if (req.query.category) where.categories = { has: req.query.category };
    if (req.query.role) where.role = req.query.role;
    const contacts = await prisma.crmContact.findMany({
      where,
      include: { retailer: true },
      orderBy: [{ retailer: { name: "asc" } }, { name: "asc" }],
    });
    const latest = await latestActivity(contacts.map((c) => c.id));
    res.json(contacts.map((c) => ({ ...serializeContact(c), lastActivity: latest.get(c.id) || null })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/crm/category/:category — the work list: buyers in that category
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const contacts = await prisma.crmContact.findMany({
      where: { role: "Buyer", categories: { has: category } },
      include: { retailer: true },
      orderBy: [{ retailer: { name: "asc" } }, { name: "asc" }],
    });
    const latest = await latestActivity(contacts.map((c) => c.id), category);
    res.json(contacts.map((c) => ({
      ...serializeContact(c),
      retailerPriority: c.retailer.priority,
      lastActivity: latest.get(c.id) || null,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/crm/category/:category/move — { contactIds, to: "list" | "active" | "hidden" }
// puts buyers in one section of that category's work list
router.post("/category/:category/move", async (req, res) => {
  try {
    const { category } = req.params;
    const { to } = req.body;
    if (!["list", "active", "hidden"].includes(to)) return res.status(400).json({ message: "Move to list, active or hidden" });
    const ids = (req.body.contactIds || []).map(Number).filter(Boolean);
    const contacts = await prisma.crmContact.findMany({ where: { id: { in: ids } } });
    const place = (list, on) => (on ? [...new Set([...list, category])] : list.filter((x) => x !== category));
    await prisma.$transaction(contacts.map((c) => prisma.crmContact.update({
      where: { id: c.id },
      data: {
        hiddenCategories: place(c.hiddenCategories, to === "hidden"),
        activeCategories: place(c.activeCategories, to === "active"),
      },
    })));
    res.json({ updated: contacts.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/crm/contacts/:id — one person: details, team and full history
router.get("/contacts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contact = await prisma.crmContact.findUnique({ where: { id }, include: { retailer: true } });
    if (!contact) return res.status(404).json({ message: "Not found" });

    // Team = everyone else at the retailer who shares a category with them
    const colleagues = await prisma.crmContact.findMany({
      where: { retailerId: contact.retailerId, id: { not: id } },
      orderBy: { name: "asc" },
    });
    const mine = new Set(contact.categories);
    const team = colleagues.filter((c) => c.categories.some((cat) => mine.has(cat)));

    const logs = await prisma.activityLog.findMany({
      where: { OR: [{ contactId: id }, { ccContactIds: { has: id } }] },
      include: { contact: true, attachments: { select: ATTACHMENT_FIELDS } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const ccIds = [...new Set(logs.flatMap((l) => l.ccContactIds))];
    const ccPeople = ccIds.length
      ? await prisma.crmContact.findMany({ where: { id: { in: ccIds } }, select: { id: true, name: true } })
      : [];
    const ccName = new Map(ccPeople.map((p) => [p.id, p.name]));

    res.json({
      ...serializeContact(contact),
      retailerName: contact.retailer.name,
      team: team.map(serializeContact),
      history: logs.map((l) => ({
        ...serializeActivity(l),
        ccNames: l.ccContactIds.map((cid) => ccName.get(cid)).filter(Boolean),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/crm/contacts
router.post("/contacts", async (req, res) => {
  try {
    if (!req.body.name || !req.body.retailerId) return res.status(400).json({ message: "Name and retailer are required" });
    const contact = await prisma.crmContact.create({
      data: { retailerId: Number(req.body.retailerId), ...contactData(req.body) },
      include: { retailer: true },
    });
    res.status(201).json(serializeContact(contact));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/crm/contacts/:id
router.put("/contacts/:id", async (req, res) => {
  try {
    const contact = await prisma.crmContact.update({
      where: { id: Number(req.params.id) },
      data: {
        ...contactData(req.body),
        ...(req.body.retailerId !== undefined && { retailerId: Number(req.body.retailerId) }),
      },
      include: { retailer: true },
    });
    res.json(serializeContact(contact));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/crm/contacts/:id — their history goes with them
router.delete("/contacts/:id", async (req, res) => {
  try {
    await prisma.crmContact.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ATTACHMENT_FIELDS = { id: true, filename: true, contentType: true, size: true };

// { filename, contentType, data: base64 } → fields for a CrmAttachment, or throws a 400-style message
function attachmentData(file) {
  const filename = String(file?.filename || "").trim().slice(0, 255);
  const buffer = Buffer.from(String(file?.data || ""), "base64");
  if (!filename || !buffer.length) throw Object.assign(new Error("The file is empty"), { status: 400 });
  if (buffer.length > MAX_FILE_BYTES) throw Object.assign(new Error("File is too large (15 MB max)"), { status: 400 });
  return { filename, contentType: String(file.contentType || "application/octet-stream").slice(0, 150), size: buffer.length, data: buffer };
}

// POST /api/crm/log — log one action on one or many people
// { contactIds, ccContactIds?, action, note?, recap?, attachment?: { filename, contentType, data }, date?, category?, nextFollowUp?, status? }
// nextFollowUp: a date, null to clear, or left out to keep. status: left out = automatic.
router.post("/log", async (req, res) => {
  try {
    const { action, note, category, status } = req.body;
    const contactIds = [...new Set((req.body.contactIds || []).map(Number))].filter(Boolean);
    const ccContactIds = [...new Set((req.body.ccContactIds || []).map(Number))].filter((id) => id && !contactIds.includes(id));
    if (!contactIds.length) return res.status(400).json({ message: "Pick at least one person" });
    if (!LOG_ACTIONS.includes(action)) return res.status(400).json({ message: `Action must be one of ${LOG_ACTIONS.join(", ")}` });
    if (status !== undefined && status !== null && !STATUSES.includes(status)) return res.status(400).json({ message: "Unknown status" });
    const date = new Date(req.body.date || todayNY());
    if (Number.isNaN(date.getTime())) return res.status(400).json({ message: "Bad date" });

    const contacts = await prisma.crmContact.findMany({ where: { id: { in: contactIds } } });
    if (contacts.length !== contactIds.length) return res.status(404).json({ message: "Contact not found" });
    const recap = req.body.recap ? String(req.body.recap).trim() || null : null;
    let file = null;
    if (req.body.attachment) {
      try {
        file = attachmentData(req.body.attachment);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    await prisma.$transaction(contacts.flatMap((c) => {
      // Bulk logs without a category use the person's only category, if they have one
      const cat = category && c.categories.includes(category) ? category
        : c.categories.filter((x) => x !== "Other").length === 1 ? c.categories.find((x) => x !== "Other") : null;
      return [
        prisma.activityLog.create({
          data: {
            retailerId: c.retailerId, contactId: c.id, ccContactIds, category: cat,
            rep: req.userName || null, date, actionTaken: action, notes: note ? String(note).trim() : null,
            recap, ...(file && { attachments: { create: file } }),
          },
        }),
        prisma.crmContact.update({
          where: { id: c.id },
          data: {
            status: status || statusAfter(action, c.status),
            ...(req.body.nextFollowUp !== undefined && {
              nextFollowUp: req.body.nextFollowUp ? new Date(req.body.nextFollowUp) : null,
            }),
          },
        }),
      ];
    }));
    res.status(201).json({ logged: contacts.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/crm/import — { category, rows: [{ header: value }] } from one tab of the Excel CRM
router.post("/import", async (req, res) => {
  try {
    const { category, rows } = req.body;
    if (!CONTACT_CATEGORIES.includes(category)) return res.status(400).json({ message: "Pick a category" });
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ message: "No rows to import" });
    const summary = await importRows(prisma, rows, { category, rep: req.userName || null, today: todayNY() });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      include: { retailer: true, contact: true },
      orderBy: { date: "desc" },
      take: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(logs.map(serializeActivity));
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/crm/activity/:id
router.put("/activity/:id", async (req, res) => {
  try {
    const { category, rep, date, actionTaken, notes, recap, nextStep, nextStepDate, done } = req.body;
    if (actionTaken !== undefined && !ALL_ACTIONS.includes(actionTaken)) return res.status(400).json({ message: "Unknown action" });
    const log = await prisma.activityLog.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(category !== undefined && { category: category || null }),
        ...(rep !== undefined && { rep: rep || null }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(actionTaken !== undefined && { actionTaken }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(recap !== undefined && { recap: recap ? String(recap).trim() || null : null }),
        ...(nextStep !== undefined && { nextStep: nextStep || null }),
        ...(nextStepDate !== undefined && { nextStepDate: nextStepDate ? new Date(nextStepDate) : null }),
        ...(done !== undefined && { done }),
      },
      include: { retailer: true, attachments: { select: ATTACHMENT_FIELDS } },
    });
    res.json(serializeActivity(log));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/crm/activity/:id
router.delete("/activity/:id", async (req, res) => {
  try {
    await prisma.activityLog.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/crm/activity/:id/attachments — { filename, contentType, data: base64 }
router.post("/activity/:id/attachments", async (req, res) => {
  try {
    const log = await prisma.activityLog.findUnique({ where: { id: Number(req.params.id) }, select: { id: true } });
    if (!log) return res.status(404).json({ message: "Entry not found" });
    let file;
    try {
      file = attachmentData(req.body);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    const created = await prisma.crmAttachment.create({ data: { activityLogId: log.id, ...file }, select: ATTACHMENT_FIELDS });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/crm/attachments/:id/file — the file itself
router.get("/attachments/:id/file", async (req, res) => {
  try {
    const f = await prisma.crmAttachment.findUnique({ where: { id: Number(req.params.id) } });
    if (!f) return res.status(404).json({ message: "File not found" });
    res.set("Content-Type", f.contentType);
    res.set("Content-Disposition", `inline; filename="${f.filename.replace(/["\\\r\n]/g, "_")}"`);
    res.send(Buffer.from(f.data));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/crm/attachments/:id
router.delete("/attachments/:id", async (req, res) => {
  try {
    await prisma.crmAttachment.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/crm/sent/:id
router.delete("/sent/:id", async (req, res) => {
  try {
    await prisma.sentItem.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

// GET /api/crm/dashboard — counts and to-do lists for buyers
router.get("/dashboard", async (req, res) => {
  try {
    const today = todayNY();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 30);

    const everyone = await prisma.crmContact.findMany({
      where: { role: "Buyer", retailer: { archived: false } },
      include: { retailer: true },
    });
    // Buyers parked on every one of their category lists aren't being chased
    const buyers = everyone.filter((b) => !b.categories.length || b.categories.some((c) => !b.hiddenCategories.includes(c)));
    const latest = await latestActivity(buyers.map((b) => b.id));
    const row = (b) => ({ ...serializeContact(b), retailerName: b.retailer.name, lastActivity: latest.get(b.id) || null });

    const statusCounts = {};
    for (const b of buyers) statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;

    const closed = ["Not Interested", "N/A"];
    const followUps = buyers
      .filter((b) => b.nextFollowUp && isoDate(b.nextFollowUp) <= today && !closed.includes(b.status))
      .sort((a, b) => a.nextFollowUp - b.nextFollowUp)
      .map(row);

    // Worked buyers (not brand new, not closed) with nothing logged in 30 days
    const notTouched = buyers
      .filter((b) => !["Not Contacted", ...closed].includes(b.status))
      .map(row)
      .filter((b) => !b.lastActivity || b.lastActivity.date < isoDate(cutoff))
      .sort((a, b) => (a.lastActivity?.date || "").localeCompare(b.lastActivity?.date || ""));

    const topPriority = buyers
      .filter((b) => b.retailer.priority === "3 - High" && ["Active", "Order Placed", "Warm"].includes(b.status))
      .map(row);

    const recent = await prisma.activityLog.findMany({
      where: { contactId: { not: null } },
      include: { retailer: true, contact: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 25,
    });

    res.json({
      today,
      statusCounts,
      totalBuyers: buyers.length,
      totalAccounts: new Set(buyers.map((b) => b.retailerId)).size,
      followUps,
      notTouched,
      topPriority,
      recentActivity: recent.map(serializeActivity),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

// POST /api/crm/retailer-types
router.post("/retailer-types", async (req, res) => {
  try {
    const { name } = req.body;
    const type = await prisma.retailerType.create({ data: { name: name.trim() } });
    res.status(201).json({ id: type.id, name: type.name });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/crm/retailer-types/:id
router.delete("/retailer-types/:id", async (req, res) => {
  try {
    await prisma.retailerType.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

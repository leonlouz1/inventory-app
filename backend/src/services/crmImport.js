// Turns rows from the Excel CRM (a category NOTES tab, Cold Account Notes, or
// CONTACTS) into retailers, contacts and history entries.
const { CONTACT_CATEGORIES, STATUSES } = require("../constants/crm");

// "Beall's" and "Bealls" are the same retailer
function normName(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lines(v) {
  if (v === null || v === undefined) return [];
  return String(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// Header lookup that ignores case, spacing and trailing punctuation
function pick(row, ...names) {
  const wanted = names.map(normName);
  for (const [k, v] of Object.entries(row)) {
    if (wanted.includes(normName(k)) && v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
}

function isoDay(v) {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function roleFrom(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return null;
  if (/\b(dmm|gmm|vp|director)\b/.test(t)) return "DMM";
  if (/\b(ma|aa|assistant|associate|analyst|planner)\b/.test(t)) return "MA/Assistant";
  if (/payable|\bap\b|accounting|invoice/.test(t)) return "Accounts Payable";
  if (/logistic|routing|transport|shipping|traffic/.test(t)) return "Logistics";
  if (/buyer/.test(t)) return "Buyer";
  return null;
}

function categoryFrom(v, fallback) {
  const t = normName(v);
  const match = CONTACT_CATEGORIES.find((c) => normName(c) === t);
  return match || fallback;
}

function statusFrom(v) {
  const t = normName(v);
  if (!t) return null;
  if (t === "nocontact") return "No Contact Found";
  return STATUSES.find((s) => normName(s) === t) || null;
}

// One spreadsheet row → { company, category, people[], status, nextFollowUp, history[] }
// people[0] is the main buyer; history entries go on that person with the rest cc'd.
function parseRow(row, fallbackCategory) {
  const company = String(pick(row, "Company", "Retailer", "Accounts") || "").trim();
  if (!company) return null;
  const category = categoryFrom(pick(row, "Category"), fallbackCategory);

  const names = lines(pick(row, "Buyer Name", "Name"));
  const emails = lines(pick(row, "Email", "Emails")).filter((e) => e.includes("@"));
  const directs = lines(pick(row, "Direct #", "Direct Phone", "Direct"));
  const hq = lines(pick(row, "HQ #", "HQ Phone", "HQ"))[0] || null;
  const mobiles = lines(pick(row, "Mobile Phone", "Mobile"));
  const title = pick(row, "Title / Dept", "Title");

  const people = names.map((raw, i) => {
    // "Amy Roger - MA" → name Amy Roger, role MA/Assistant
    const [name, suffix] = raw.split(/\s+-\s+/);
    let direct = directs[i] || null;
    let mobile = mobiles[i] || null;
    // "M: ..." / "D: ..." prefixes say which kind of number it really is
    if (direct && /^m:/i.test(direct)) { mobile = mobile || direct.replace(/^m:\s*/i, ""); direct = null; }
    if (mobile && /^d:/i.test(mobile)) { direct = direct || mobile.replace(/^d:\s*/i, ""); mobile = null; }
    const roleText = suffix || (names.length === 1 ? title : null);
    return {
      name: name.trim(),
      role: roleFrom(roleText) || (suffix ? "Other" : "Buyer"),
      title: suffix || (names.length === 1 && title ? String(title).trim() : null),
      email: emails[i] || null,
      directPhone: direct ? String(direct).replace(/^d:\s*/i, "") : null,
      mobilePhone: mobile,
      hqPhone: hq,
    };
  });

  const status = statusFrom(pick(row, "ACCOUNT STATUS", "STATUS"));
  // undefined = the tab has no follow-up column, so leave the contact's alone
  const hasFollowUpCol = Object.keys(row).some((k) => normName(k).startsWith("nextfollow"));
  const nextFollowUp = hasFollowUpCol ? isoDay(pick(row, "Next Follow up", "Next Follow-up")) : undefined;
  const lastUpdated = isoDay(pick(row, "LAST UPDATED"));
  const action = pick(row, "Action");
  const notes = pick(row, "Notes");
  const followUpAction = pick(row, "Follow up Action");
  const lastCalled = isoDay(pick(row, "Last Called"));
  const callStatus = pick(row, "Call status", "Call Status");

  const history = [];
  if (notes || (lastUpdated && action)) {
    const parts = [action && notes ? `${action}: ${notes}` : (notes || action)];
    if (followUpAction) parts.push(`Next: ${followUpAction}`);
    history.push({ action: "Note", date: lastUpdated, note: parts.filter(Boolean).join(" · ").trim() });
  }
  if (lastCalled) {
    history.push({ action: "Called", date: lastCalled, note: callStatus && callStatus !== "NA" ? String(callStatus) : null });
  }

  return { company, category, people, status, nextFollowUp, history };
}

// Applies parsed rows. Retailers and contacts are matched by name, so
// importing the same tab twice updates instead of duplicating.
async function importRows(prisma, rows, { category: fallbackCategory, rep, today }) {
  const summary = { rows: 0, retailersCreated: 0, contactsCreated: 0, contactsUpdated: 0, historyAdded: 0, skipped: 0 };
  const retailers = await prisma.retailer.findMany({ select: { id: true, name: true } });
  const byName = new Map(retailers.map((r) => [normName(r.name), r]));

  for (const raw of rows) {
    const row = parseRow(raw, fallbackCategory);
    if (!row || !row.people.length) { summary.skipped++; continue; }
    summary.rows++;

    let retailer = byName.get(normName(row.company));
    if (!retailer) {
      retailer = await prisma.retailer.create({ data: { name: row.company }, select: { id: true, name: true } });
      byName.set(normName(row.company), retailer);
      summary.retailersCreated++;
    }

    const existing = await prisma.crmContact.findMany({ where: { retailerId: retailer.id } });
    const contactIds = [];
    for (const [i, p] of row.people.entries()) {
      const match = existing.find((c) => normName(c.name) === normName(p.name));
      // The sheet's status and follow-up belong to the main buyer on the row
      const statusData = i === 0 && p.role === "Buyer"
        ? { ...(row.status && { status: row.status }), ...(row.nextFollowUp !== undefined && { nextFollowUp: row.nextFollowUp ? new Date(row.nextFollowUp) : null }) }
        : {};
      if (match) {
        await prisma.crmContact.update({
          where: { id: match.id },
          data: {
            categories: [...new Set([...match.categories, row.category])],
            role: match.role === "Buyer" && p.role !== "Buyer" ? p.role : match.role,
            title: match.title || p.title,
            email: match.email || p.email,
            directPhone: match.directPhone || p.directPhone,
            mobilePhone: match.mobilePhone || p.mobilePhone,
            hqPhone: match.hqPhone || p.hqPhone,
            ...statusData,
          },
        });
        contactIds.push(match.id);
        summary.contactsUpdated++;
      } else {
        const created = await prisma.crmContact.create({
          data: { retailerId: retailer.id, ...p, categories: [row.category], ...statusData },
        });
        existing.push(created);
        contactIds.push(created.id);
        summary.contactsCreated++;
      }
    }

    const [mainId, ...ccIds] = contactIds;
    for (const h of row.history) {
      const date = new Date(h.date || today);
      const dup = await prisma.activityLog.findFirst({
        where: { contactId: mainId, date, actionTaken: h.action, notes: h.note || null },
      });
      if (dup) continue;
      await prisma.activityLog.create({
        data: {
          retailerId: retailer.id, contactId: mainId, ccContactIds: ccIds, category: row.category,
          rep, date, actionTaken: h.action, notes: h.note || null,
        },
      });
      summary.historyAdded++;
    }
  }
  return summary;
}

module.exports = { parseRow, importRows, normName };

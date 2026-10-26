const prisma = require("../prismaClient");
const { sendEmail } = require("../emailService");

// Daily reminder email: unshipped orders that need someone to act.
//   - not routed and the ship date has passed
//   - not routed and shipping within the next N days
//   - routed but not picked up after the ship date
//   - cancel date within the next N days (or already passed)

const APP_URL = process.env.APP_URL || "https://inventory-app-murex-five.vercel.app";
const OPEN_STATUSES = ["CONFIRMED", "ROUTED", "ALLOCATED"];

// Dates are compared as YYYY-MM-DD in New York time
function todayNY() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function isWeekendNY() {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date());
  return day === "Sat" || day === "Sun";
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000);
}

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function getSettings() {
  return prisma.reminderSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

// { today, sections: [{ key, title, orders: [...] }] }
async function findReminderOrders(settings, today = todayNY()) {
  const orders = await prisma.order.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { lines: { select: { shipDate: true, quantity: true } } },
  });

  const rows = orders.map((o) => {
    const shipDates = o.lines.map((l) => isoDate(l.shipDate)).sort();
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customer: o.customer,
      customerPo: o.customerPo,
      status: o.status,
      shipDate: shipDates[0] ?? null,
      cancelDate: isoDate(o.cancelDate),
      units: o.lines.reduce((sum, l) => sum + l.quantity, 0),
      url: `${APP_URL}/orders/${o.id}`,
    };
  });

  const upcomingEnd = addDays(today, settings.upcomingDays);
  const cancelEnd = addDays(today, settings.cancelDays);
  const notRouted = (r) => r.status === "CONFIRMED";
  const byShip = (a, b) => (a.shipDate || "").localeCompare(b.shipDate || "");

  const sections = [
    {
      key: "overdue",
      title: "Ship date passed, not routed",
      orders: rows.filter((r) => notRouted(r) && r.shipDate && r.shipDate < today).sort(byShip),
    },
    {
      key: "upcoming",
      title: `Shipping in the next ${settings.upcomingDays} days, not routed`,
      orders: rows.filter((r) => notRouted(r) && r.shipDate && r.shipDate >= today && r.shipDate <= upcomingEnd).sort(byShip),
    },
    {
      key: "notPickedUp",
      title: "Routed but not picked up",
      orders: rows.filter((r) => !notRouted(r) && r.shipDate && r.shipDate < today).sort(byShip),
    },
    {
      key: "cancel",
      title: `Cancel date within ${settings.cancelDays} days`,
      orders: rows
        .filter((r) => r.cancelDate && r.cancelDate <= cancelEnd)
        .sort((a, b) => a.cancelDate.localeCompare(b.cancelDate)),
    },
  ];
  for (const section of sections) {
    for (const r of section.orders) {
      r.daysLate = r.shipDate && r.shipDate < today ? daysBetween(r.shipDate, today) : 0;
    }
  }
  return { today, sections };
}

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

function digestHtml({ today, sections }) {
  const cell = "padding:6px 10px;border-bottom:1px solid #eee;font-size:13px";
  const head = "padding:6px 10px;text-align:left;border-bottom:2px solid #ddd;font-size:12px;color:#555";
  const total = sections.reduce((n, s) => n + s.orders.length, 0);
  const blocks = sections
    .filter((s) => s.orders.length)
    .map((s) => `
  <h3 style="margin:28px 0 8px;font-size:15px">${esc(s.title)} <span style="color:#888;font-weight:normal">(${s.orders.length})</span></h3>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="background:#f5f5f5">
      <th style="${head}">Order</th><th style="${head}">Customer</th><th style="${head}">PO #</th>
      <th style="${head}">Ship date</th><th style="${head}">Cancel date</th><th style="${head};text-align:right">Units</th>
    </tr></thead>
    <tbody>${s.orders.map((o) => `
      <tr>
        <td style="${cell}"><a href="${esc(o.url)}" style="color:#1677ff">${esc(o.orderNumber)}</a></td>
        <td style="${cell}">${esc(o.customer)}</td>
        <td style="${cell}">${esc(o.customerPo || "—")}</td>
        <td style="${cell}">${formatDate(o.shipDate)}${o.daysLate ? ` <span style="color:#cf1322">(${o.daysLate}d late)</span>` : ""}</td>
        <td style="${cell}">${formatDate(o.cancelDate)}${o.cancelDate && o.cancelDate < today ? ' <span style="color:#cf1322">(passed)</span>' : ""}</td>
        <td style="${cell};text-align:right">${o.units}</td>
      </tr>`).join("")}
    </tbody>
  </table>`)
    .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;color:#222;max-width:760px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px">Orders needing attention</h2>
  <div style="color:#888;font-size:13px">${formatDate(today)} · ${total} order${total === 1 ? "" : "s"}</div>
  ${blocks || '<p style="margin-top:24px">Nothing needs attention today.</p>'}
  <p style="margin-top:32px;color:#aaa;font-size:12px">Sent by BasicCloud. Change who gets this under Reminders.</p>
</body></html>`;
}

// Sends the digest to everyone on the list. Unless forced (a test send),
// nothing goes out when no orders need attention.
async function sendDigest({ force = false } = {}) {
  const settings = await getSettings();
  if (!settings.recipients.length) throw new Error("Add at least one email address first");
  const digest = await findReminderOrders(settings);
  const total = digest.sections.reduce((n, s) => n + s.orders.length, 0);
  if (!total && !force) return { sent: false, reason: "Nothing needs attention", total };

  await sendEmail({
    to: settings.recipients,
    subject: total ? `${total} order${total === 1 ? "" : "s"} need attention (${formatDate(digest.today)})` : "No orders need attention",
    html: digestHtml(digest),
  });
  await prisma.reminderSettings.update({ where: { id: 1 }, data: { lastSentOn: new Date(`${digest.today}T00:00:00Z`) } });
  return { sent: true, total, recipients: settings.recipients.length };
}

// The scheduled run: weekdays only, at most once a day
async function runScheduledDigest() {
  const settings = await getSettings();
  if (!settings.enabled) return { sent: false, reason: "Reminders are turned off" };
  if (isWeekendNY()) return { sent: false, reason: "Weekend" };
  if (isoDate(settings.lastSentOn) === todayNY()) return { sent: false, reason: "Already sent today" };
  if (!settings.recipients.length) return { sent: false, reason: "No recipients" };
  return sendDigest();
}

module.exports = { getSettings, findReminderOrders, sendDigest, runScheduledDigest, digestHtml, todayNY };

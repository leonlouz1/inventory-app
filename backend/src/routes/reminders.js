const express = require("express");
const crypto = require("crypto");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");
const { getSettings, findReminderOrders, sendDigest, runScheduledDigest } = require("../services/reminders");

const router = express.Router();

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const settingsView = (s) => ({ ...s, lastSentOn: isoDate(s.lastSentOn) });

// GET /api/reminders/settings
router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    res.json(settingsView(await getSettings()));
  })
);

// PUT /api/reminders/settings — { enabled?, recipients?, upcomingDays?, cancelDays? }
router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const data = {};
    if (req.body.enabled !== undefined) data.enabled = Boolean(req.body.enabled);
    if (req.body.recipients !== undefined) {
      const emails = [...new Set((req.body.recipients || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
      const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (bad) return res.status(400).json({ message: `${bad} isn't a valid email address` });
      data.recipients = emails;
    }
    for (const key of ["upcomingDays", "cancelDays"]) {
      if (req.body[key] === undefined) continue;
      const n = Number(req.body[key]);
      if (!Number.isInteger(n) || n < 0 || n > 60) return res.status(400).json({ message: "Days must be a whole number from 0 to 60" });
      data[key] = n;
    }
    await getSettings();
    res.json(settingsView(await prisma.reminderSettings.update({ where: { id: 1 }, data })));
  })
);

// GET /api/reminders/preview — what today's email would list
router.get(
  "/preview",
  asyncHandler(async (req, res) => {
    res.json(await findReminderOrders(await getSettings()));
  })
);

// POST /api/reminders/send-now — send today's email now (even if empty)
router.post(
  "/send-now",
  asyncHandler(async (req, res) => {
    try {
      res.json(await sendDigest({ force: true }));
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  })
);

// POST /api/reminders/run — called by the daily schedule (GitHub Actions),
// not a signed-in user; needs the x-cron-secret header to match CRON_SECRET.
router.post(
  "/run",
  asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET || "";
    const given = String(req.headers["x-cron-secret"] || "");
    const ok = secret.length >= 16 && given.length === secret.length
      && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) return res.status(401).json({ message: "Not allowed" });
    res.json(await runScheduledDigest());
  })
);

module.exports = router;

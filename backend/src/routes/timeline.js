const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { buildSkuTimeline } = require("../services/timeline");

const router = express.Router();

// GET /api/timeline?sku=WDG-001&grain=month — 12 (or 16, for grain=week) period
// projection for one SKU, all warehouses, broken down by period
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { sku, grain } = req.query;
    if (!sku) {
      return res.status(400).json({ message: "sku query parameter is required" });
    }

    try {
      const timeline = await buildSkuTimeline(sku, grain);
      res.json(timeline);
    } catch (err) {
      if (err.message && err.message.startsWith("Unknown SKU")) {
        return res.status(404).json({ message: err.message });
      }
      throw err;
    }
  })
);

module.exports = router;

const express = require("express");
const prisma = require("../prismaClient");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();

// GET /api/warehouses — list all warehouses
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const warehouses = await prisma.warehouse.findMany({ orderBy: { id: "asc" } });
    res.json(warehouses);
  })
);

// POST /api/warehouses — add warehouse
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, location } = req.body;
    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    try {
      const warehouse = await prisma.warehouse.create({ data: { name, location } });
      res.status(201).json(warehouse);
    } catch (err) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: `Warehouse name "${name}" already exists` });
      }
      throw err;
    }
  })
);

module.exports = router;

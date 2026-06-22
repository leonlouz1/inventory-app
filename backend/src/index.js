require("dotenv").config();
const express = require("express");
const cors = require("cors");

const productsRouter = require("./routes/products");
const ordersRouter = require("./routes/orders");
const restocksRouter = require("./routes/restocks");
const warehousesRouter = require("./routes/warehouses");
const timelineRouter = require("./routes/timeline");
const alertsRouter = require("./routes/alerts");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/restocks", restocksRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/timeline", timelineRouter);
app.use("/api/alerts", alertsRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message && err.message.startsWith("Unknown SKU")) {
    return res.status(404).json({ message: err.message });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ message: "Record not found" });
  }
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Inventory API listening on http://localhost:${PORT}`);
});

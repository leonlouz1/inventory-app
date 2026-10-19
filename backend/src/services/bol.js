const PDFDocument = require("pdfkit");

// Company names that can appear as the shipper (Ship From); the address is
// always the shipment warehouse's.
const SHIPPER_NAMES = ["Quality Silver Inc", "Basic Trading Inc"];

// Everything a BOL needs that the app already knows about a shipment: ship
// from (our name + the shipment warehouse's address), the remembered ship-to
// for its customer, carrier details, and case counts from each product's case pack.
async function loadBolData(prisma, shipmentId) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      warehouse: true,
      orders: { include: { lines: { include: { product: true } } }, orderBy: { orderNumber: "asc" } },
    },
  });
  if (!shipment) return null;

  const customers = [...new Set(shipment.orders.map((o) => o.customer))];
  const customer = customers[0] ?? null;
  const savedShipTo = customer
    ? await prisma.shipToAddress.findUnique({ where: { customer } })
    : null;

  const casesFor = (line) => (line.product.casePack ? Math.ceil(line.quantity / line.product.casePack) : null);

  const orders = shipment.orders.map((o) => {
    const cases = o.lines.reduce((sum, l) => sum + (casesFor(l) ?? 0), 0);
    return {
      orderNumber: o.orderNumber,
      customerPo: o.customerPo,
      cases,
      missingCasePack: o.lines.some((l) => !l.product.casePack),
    };
  });

  // Carrier table: one row per kind of product (category)
  const byCommodity = new Map();
  for (const o of shipment.orders) {
    for (const l of o.lines) {
      const description = l.product.category || "General merchandise";
      const row = byCommodity.get(description) || { description, cases: 0, units: 0 };
      row.cases += casesFor(l) ?? 0;
      row.units += l.quantity;
      byCommodity.set(description, row);
    }
  }

  const w = shipment.warehouse;
  return {
    shipmentId: shipment.id,
    bolNumber: shipment.shipmentNumber,
    date: shipment.pickupDate.toISOString().slice(0, 10),
    customer,
    customers,
    carrier: shipment.carrier,
    proNumber: shipment.csNumber,
    shipperNames: SHIPPER_NAMES,
    shipFrom: {
      name: SHIPPER_NAMES[0],
      warehouse: w?.name ?? null,
      address: w?.address ?? null,
      city: w?.city ?? null,
      state: w?.state ?? null,
      zip: w?.zip ?? null,
      phone: w?.phone ?? null,
    },
    shipTo: {
      name: savedShipTo?.name ?? customer,
      address: savedShipTo?.address ?? null,
      city: savedShipTo?.city ?? null,
      state: savedShipTo?.state ?? null,
      zip: savedShipTo?.zip ?? null,
      locationNo: savedShipTo?.locationNo ?? null,
    },
    orders,
    commodities: [...byCommodity.values()],
    totalCases: orders.reduce((s, o) => s + o.cases, 0),
    missingCasePack: orders.some((o) => o.missingCasePack),
  };
}

// ---- PDF ----

const PAGE = { left: 30, right: 582, top: 28 };
const WIDTH = PAGE.right - PAGE.left;

function cityLine(a) {
  return [[a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" ");
}

function box(doc, x, y, w, h, title) {
  doc.lineWidth(0.7).rect(x, y, w, h).stroke();
  if (title) {
    doc.rect(x, y, w, 13).fillAndStroke("#000", "#000");
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8).text(title, x + 4, y + 3, { width: w - 8 });
    doc.fillColor("#000");
  }
}

function text(doc, value, x, y, opts = {}) {
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size || 8.5)
    .text(value ?? "", x, y, { width: opts.width, align: opts.align || "left", lineGap: 1 });
}

function check(doc, x, y, label, checked) {
  doc.lineWidth(0.6).rect(x, y, 8, 8).stroke();
  if (checked) doc.font("Helvetica-Bold").fontSize(8).text("X", x + 1.5, y + 0.5);
  text(doc, label, x + 11, y, { size: 8 });
}

// Simple grid: columns [{ title, width, align }], rows of cell strings
function table(doc, y, columns, rows, { totals } = {}) {
  const rowH = 14;
  let x = PAGE.left;
  doc.rect(PAGE.left, y, WIDTH, rowH).fillAndStroke("#e7e6e6", "#000");
  doc.fillColor("#000");
  for (const c of columns) {
    doc.lineWidth(0.5).rect(x, y, c.width, rowH).stroke();
    text(doc, c.title, x + 3, y + 3.5, { bold: true, size: 7.5, width: c.width - 6, align: c.align });
    x += c.width;
  }
  let rowY = y + rowH;
  for (const [i, row] of [...rows, ...(totals ? [totals] : [])].entries()) {
    const isTotal = totals && i === rows.length;
    x = PAGE.left;
    for (const [j, c] of columns.entries()) {
      doc.lineWidth(0.5).rect(x, rowY, c.width, rowH).stroke();
      text(doc, row[j] == null ? "" : String(row[j]), x + 3, rowY + 3.5, { bold: isTotal, width: c.width - 6, align: c.align });
      x += c.width;
    }
    rowY += rowH;
  }
  return rowY;
}

// input: { shipTo, pallets, weight, freightClass, nmfc, freightTerms, billTo,
// specialInstructions, trailerNumber, sealNumber, scac }
function renderBolPdf(data, input) {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 28, bottom: 20, left: 30, right: 30 } });
  const half = WIDTH / 2;
  const L = PAGE.left;
  const R = L + half;

  // Header
  text(doc, `Date: ${data.date}`, L, PAGE.top, { size: 9 });
  text(doc, "STRAIGHT BILL OF LADING", L, PAGE.top - 2, { bold: true, size: 14, width: WIDTH, align: "center" });
  text(doc, "ORIGINAL – NOT NEGOTIABLE", L, PAGE.top + 14, { size: 8, width: WIDTH, align: "center" });
  text(doc, `Bill of Lading No.: ${data.bolNumber}`, L, PAGE.top, { bold: true, size: 9, width: WIDTH, align: "right" });
  let y = PAGE.top + 30;

  // Ship from / carrier
  box(doc, L, y, half, 70, "SHIP FROM");
  const from = { ...data.shipFrom, name: SHIPPER_NAMES.includes(input.shipFromName) ? input.shipFromName : data.shipFrom.name };
  text(doc, [from.name, from.address, cityLine(from), from.phone ? `Phone: ${from.phone}` : null].filter(Boolean).join("\n"), L + 5, y + 17, { width: half - 10 });
  box(doc, R, y, half, 70, "CARRIER");
  text(doc, `Carrier Name: ${data.carrier || ""}`, R + 5, y + 17, { width: half - 10 });
  text(doc, `Trailer No.: ${input.trailerNumber || ""}`, R + 5, y + 29, { width: half - 10 });
  text(doc, `Seal Number(s): ${input.sealNumber || ""}`, R + 5, y + 41, { width: half - 10 });
  text(doc, `SCAC: ${input.scac || ""}`, R + 5, y + 53, { width: half / 2 - 10 });
  text(doc, `Pro No.: ${data.proNumber || ""}`, R + half / 2, y + 53, { width: half / 2 - 5 });
  y += 70;

  // Ship to / freight terms
  box(doc, L, y, half, 70, "SHIP TO");
  const to = input.shipTo || {};
  text(doc, [to.name, to.address, cityLine(to)].filter(Boolean).join("\n"), L + 5, y + 17, { width: half - 10 });
  if (to.locationNo) text(doc, `Location No.: ${to.locationNo}`, L + 5, y + 56, { width: half - 10 });
  box(doc, R, y, half, 70, "FREIGHT CHARGE TERMS");
  const terms = input.freightTerms || "PREPAID";
  check(doc, R + 8, y + 20, "Prepaid", terms === "PREPAID");
  check(doc, R + 78, y + 20, "Collect", terms === "COLLECT");
  check(doc, R + 148, y + 20, "3rd Party", terms === "THIRD_PARTY");
  text(doc, "(Freight charges are prepaid unless marked otherwise)", R + 8, y + 34, { size: 7, width: half - 16 });
  check(doc, R + 8, y + 52, "Master Bill of Lading", false);
  y += 70;

  // Third party bill to / special instructions
  const billToH = 46;
  box(doc, L, y, half, billToH, "THIRD PARTY FREIGHT CHARGES BILL TO");
  if (terms === "THIRD_PARTY") text(doc, input.billTo || "", L + 5, y + 17, { width: half - 10 });
  box(doc, R, y, half, billToH, "SPECIAL INSTRUCTIONS");
  text(doc, input.specialInstructions || "", R + 5, y + 17, { width: half - 10 });
  y += billToH + 8;

  // Customer order information
  text(doc, "CUSTOMER ORDER INFORMATION", L, y, { bold: true, size: 9 });
  y += 12;
  y = table(
    doc,
    y,
    [
      { title: "Customer Order No. (PO)", width: 230 },
      { title: "# Pkgs", width: 70, align: "right" },
      { title: "Pallet/Slip (Y/N)", width: 80, align: "center" },
      { title: "Additional Shipper Info", width: WIDTH - 380 },
    ],
    data.orders.map((o) => [o.customerPo || "", o.cases || "", input.pallets ? "Y" : "", ""]),
    { totals: ["GRAND TOTAL", data.totalCases || "", "", ""] }
  );
  y += 8;

  // Carrier information
  text(doc, "CARRIER INFORMATION", L, y, { bold: true, size: 9 });
  y += 12;
  const pallets = Number(input.pallets) || null;
  y = table(
    doc,
    y,
    [
      { title: "HU Qty", width: 42, align: "right" },
      { title: "HU Type", width: 48 },
      { title: "Pkg Qty", width: 46, align: "right" },
      { title: "Pkg Type", width: 46 },
      { title: "Weight", width: 56, align: "right" },
      { title: "H.M.", width: 30, align: "center" },
      { title: "Commodity Description", width: WIDTH - 42 - 48 - 46 - 46 - 56 - 30 - 64 - 48 },
      { title: "NMFC No.", width: 64 },
      { title: "Class", width: 48 },
    ],
    data.commodities.map((c, i) => [
      i === 0 && pallets ? pallets : "",
      i === 0 && pallets ? "PLT" : "",
      c.cases || c.units,
      c.cases ? "CTN" : "PCS",
      i === 0 && input.weight ? `${input.weight} lb` : "",
      "",
      c.description,
      input.nmfc || "",
      input.freightClass || "",
    ]),
    {
      totals: [pallets || "", pallets ? "PLT" : "", data.totalCases || "", data.totalCases ? "CTN" : "", input.weight ? `${input.weight} lb` : "", "", "GRAND TOTAL", "", ""],
    }
  );
  y += 8;

  // Terms (concise standard language)
  const small = (t, h) => {
    text(doc, t, L, y, { size: 6.5, width: WIDTH });
    y += h;
  };
  small(
    "Where the rate is dependent on value, shippers are required to state specifically in writing the agreed or declared value of the property. " +
      "The agreed or declared value of the property is specifically stated by the shipper to be not exceeding ________ per ________.",
    20
  );
  small(
    "NOTE: Liability limitation for loss or damage in this shipment may be applicable. See 49 U.S.C. 14706(c)(1)(A) and (B). " +
      "The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.",
    20
  );
  small(
    "RECEIVED, subject to individually determined rates or contracts agreed upon in writing between the carrier and shipper, if applicable, " +
      "otherwise to the rates, classifications and rules established by the carrier and available to the shipper on request, and to all " +
      "applicable state and federal regulations. This is to certify that the above named materials are properly classified, packaged, " +
      "marked and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.",
    30
  );

  // Signatures
  const sigH = 78;
  const third = WIDTH / 3;
  box(doc, L, y, third, sigH, "SHIPPER SIGNATURE / DATE");
  text(doc, "____________________________\nSignature\n\n____________________________\nDate", L + 6, y + 22, { width: third - 12, size: 8 });
  box(doc, L + third, y, third, sigH, "TRAILER LOADED / FREIGHT COUNTED");
  check(doc, L + third + 8, y + 20, "Loaded by Shipper", false);
  check(doc, L + third + 8, y + 32, "Loaded by Driver", false);
  check(doc, L + third + 8, y + 48, "Counted by Shipper", false);
  check(doc, L + third + 8, y + 60, "Counted by Driver/pallets said to contain", false);
  box(doc, L + 2 * third, y, third, sigH, "CARRIER SIGNATURE / PICKUP DATE");
  text(
    doc,
    "Carrier acknowledges receipt of packages and required placards. Property described above is received in good order, except as noted.\n\n______________________  ________",
    L + 2 * third + 6,
    y + 17,
    { width: third - 12, size: 7 }
  );

  return doc;
}

module.exports = { loadBolData, renderBolPdf };

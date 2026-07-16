const { Resend } = require("resend");
const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");

const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendEmail({ to, subject, html, attachments }) {
  const result = await getResend().emails.send({ from: FROM, to, subject, html, attachments });
  if (result.error) throw new Error(result.error.message);
  return result;
}

function invoiceHtml({ order, lines }) {
  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.productName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${l.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.shipDate}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.warehouseName || "—"}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:32px">
  <h2 style="margin-top:0;color:#1677ff">Order Confirmation — ${order.orderNumber}</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:4px 0;color:#888;width:140px">Customer</td><td><strong>${order.customer}</strong></td></tr>
    ${order.customerPo ? `<tr><td style="padding:4px 0;color:#888">Customer PO #</td><td>${order.customerPo}</td></tr>` : ""}
    <tr><td style="padding:4px 0;color:#888">Order Date</td><td>${order.orderDate}</td></tr>
    <tr><td style="padding:4px 0;color:#888">Status</td><td>${order.status}</td></tr>
    ${order.notes ? `<tr><td style="padding:4px 0;color:#888">Notes</td><td>${order.notes}</td></tr>` : ""}
  </table>

  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">SKU</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Product</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Qty</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Ship Date</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Ship From</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p style="margin-top:32px;color:#888;font-size:13px">
    This is an automated order confirmation from Hotel Collection Inc.
  </p>
</body>
</html>`;
}

function routingHtml({ order, lines, notes }) {
  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.sku}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.productName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${l.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${l.shipDate}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:32px">
  <h2 style="margin-top:0;color:#1677ff">Routing Instructions — ${order.orderNumber}</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr><td style="padding:4px 0;color:#888;width:140px">Customer</td><td><strong>${order.customer}</strong></td></tr>
    ${order.customerPo ? `<tr><td style="padding:4px 0;color:#888">Customer PO #</td><td><strong>${order.customerPo}</strong></td></tr>` : ""}
    <tr><td style="padding:4px 0;color:#888">Order Date</td><td>${order.orderDate}</td></tr>
    ${order.notes ? `<tr><td style="padding:4px 0;color:#888">Order Notes</td><td>${order.notes}</td></tr>` : ""}
    ${notes ? `<tr><td style="padding:4px 0;color:#888">Routing Notes</td><td><strong>${notes}</strong></td></tr>` : ""}
  </table>

  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">SKU</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Product</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #ddd">Qty</th>
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd">Ship Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p style="margin-top:32px;color:#888;font-size:13px">
    Please confirm receipt and advise if any issues. — Hotel Collection Inc.
  </p>
</body>
</html>`;
}

const COMPANIES = {
  "Quality Silver Inc": {
    name: "Quality Silver Inc",
    address: "390 5th Ave, STE 906",
    city: "New York, NY 10018",
    phone: "646-609-1079",
  },
  "Basic Trading Inc": {
    name: "Basic Trading Inc",
    address: "390 5th Ave, STE 906",
    city: "New York, NY 10018",
    phone: "646-609-1079",
  },
};

function buildInvoicePdf({ order, lines, company: companyKey }) {
  const company = COMPANIES[companyKey] || COMPANIES["Quality Silver Inc"];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const black = "#000000";
    const gray = "#555555";
    const lightGray = "#aaaaaa";
    const rowBg = "#f2f2f2";

    const L = 50;   // left margin
    const R = 560;  // right edge
    const W = 510;  // total width

    // ── Company name (top left)
    doc.fontSize(16).fillColor(black).font("Helvetica-Bold").text(company.name, L, 50);
    doc.fontSize(9).fillColor(gray).font("Helvetica")
      .text(company.address, L, 70)
      .text(company.city, L, 82)
      .text(company.phone, L, 94);

    // ── INVOICE label (top right)
    doc.fontSize(28).fillColor(black).font("Helvetica-Bold").text("INVOICE", 380, 50, { width: 180, align: "right" });

    // DATE / INVOICE # (right column, below INVOICE)
    doc.fontSize(9).fillColor(gray).font("Helvetica-Bold").text("DATE", 430, 90, { width: 60, align: "left" });
    doc.fontSize(9).fillColor(black).font("Helvetica").text(order.orderDate, 490, 90, { width: 70, align: "right" });
    doc.fontSize(9).fillColor(gray).font("Helvetica-Bold").text("INVOICE #", 430, 104, { width: 60, align: "left" });
    doc.fontSize(9).fillColor(black).font("Helvetica").text(order.orderNumber, 490, 104, { width: 70, align: "right" });
    if (order.customerPo) {
      doc.fontSize(9).fillColor(gray).font("Helvetica-Bold").text("PO #", 430, 118, { width: 60, align: "left" });
      doc.fontSize(9).fillColor(black).font("Helvetica").text(order.customerPo, 490, 118, { width: 70, align: "right" });
    }

    // ── Divider
    const divY = 118;
    doc.moveTo(L, divY).lineTo(R, divY).strokeColor("#cccccc").lineWidth(0.5).stroke();

    // ── BILL TO box
    let y = divY + 14;
    doc.fontSize(9).fillColor(gray).font("Helvetica-Bold").text("BILL TO", L, y);
    y += 13;
    doc.fontSize(10).fillColor(black).font("Helvetica-Bold").text(order.customer, L, y);
    y += 14;
    if (order.notes) {
      doc.fontSize(9).fillColor(gray).font("Helvetica").text(order.notes, L, y);
      y += 12;
    }

    y += 20;

    // ── Items table
    // Columns: DESCRIPTION | SKU | QTY | UNIT PRICE | TOTAL
    const cols = [
      { label: "DESCRIPTION", x: L,   w: 210, align: "left"  },
      { label: "SKU",         x: 265, w: 90,  align: "left"  },
      { label: "QTY",         x: 360, w: 45,  align: "right" },
      { label: "UNIT PRICE",  x: 410, w: 70,  align: "right" },
      { label: "TOTAL",       x: 485, w: 75,  align: "right" },
    ];

    const ROW_H = 20;

    // Header row
    doc.rect(L, y, W, ROW_H).fill(rowBg);
    doc.fontSize(8).fillColor(black).font("Helvetica-Bold");
    cols.forEach((c) => doc.text(c.label, c.x, y + 6, { width: c.w, align: c.align }));
    y += ROW_H;

    // Data rows
    doc.font("Helvetica").fontSize(9).fillColor(black);
    lines.forEach((l) => {
      doc.text(l.productName, cols[0].x, y + 5, { width: cols[0].w });
      doc.text(l.sku,         cols[1].x, y + 5, { width: cols[1].w });
      doc.text(String(l.quantity), cols[2].x, y + 5, { width: cols[2].w, align: "right" });
      doc.text("",            cols[3].x, y + 5, { width: cols[3].w, align: "right" }); // unit price blank
      doc.text("",            cols[4].x, y + 5, { width: cols[4].w, align: "right" }); // total blank
      doc.moveTo(L, y + ROW_H).lineTo(R, y + ROW_H).strokeColor("#dddddd").lineWidth(0.3).stroke();
      y += ROW_H;
    });

    y += 10;

    // ── Totals (right-aligned block)
    const totX = 390;
    const totLabelW = 90;
    const totValX = 485;
    const totValW = 75;

    function totRow(label, value) {
      doc.fontSize(9).fillColor(gray).font("Helvetica-Bold").text(label, totX, y, { width: totLabelW });
      doc.fontSize(9).fillColor(black).font("Helvetica").text(value, totValX, y, { width: totValW, align: "right" });
      y += 14;
    }

    totRow("SUBTOTAL", "");
    totRow("DISCOUNT", "");

    // Balance Due bold row
    doc.rect(totX - 5, y - 2, 175, 18).fill(rowBg);
    doc.fontSize(10).fillColor(black).font("Helvetica-Bold").text("Balance Due", totX, y + 2, { width: totLabelW });
    doc.fontSize(10).font("Helvetica-Bold").text("", totValX, y + 2, { width: totValW, align: "right" });
    y += 24;

    // ── Remarks
    if (order.notes) {
      doc.fontSize(8).fillColor(gray).font("Helvetica-Bold").text("Remarks / Payment Instructions:", L, y);
      y += 12;
      doc.fontSize(9).fillColor(black).font("Helvetica").text(order.notes, L, y, { width: 300 });
    }

    doc.end();
  });
}

function buildOrderExcel({ order, lines }) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["Order #", order.orderNumber],
    ["Customer", order.customer],
    ...(order.customerPo ? [["Customer PO #", order.customerPo]] : []),
    ["Order Date", order.orderDate],
    ["Status", order.status],
    ...(order.notes ? [["Notes", order.notes]] : []),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Order Summary");

  // Lines sheet
  const header = ["SKU", "Product Name", "Quantity", "Ship Date", "Ship From Warehouse"];
  const rows = lines.map((l) => [l.sku, l.productName, l.quantity, l.shipDate, l.warehouseName || ""]);
  const wsLines = XLSX.utils.aoa_to_sheet([header, ...rows]);
  wsLines["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsLines, "Order Lines");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf;
}

module.exports = { sendEmail, invoiceHtml, routingHtml, buildOrderExcel, buildInvoicePdf };

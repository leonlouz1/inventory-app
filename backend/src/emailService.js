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

function buildInvoicePdf({ order, lines }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const blue = "#1677ff";
    const gray = "#888888";
    const light = "#f5f5f5";

    // Header
    doc.fontSize(20).fillColor(blue).font("Helvetica-Bold").text("ORDER CONFIRMATION", 50, 50);
    doc.fontSize(13).fillColor("#333").font("Helvetica").text(order.orderNumber, 50, 76);
    doc.moveTo(50, 98).lineTo(560, 98).strokeColor(blue).lineWidth(1).stroke();

    // Bill to / order info columns
    doc.fontSize(8).fillColor(gray).font("Helvetica-Bold").text("BILL TO", 50, 112);
    doc.fontSize(11).fillColor("#222").font("Helvetica-Bold").text(order.customer, 50, 124);
    if (order.customerPo) {
      doc.fontSize(10).font("Helvetica").text(`PO # ${order.customerPo}`, 50, 139);
    }

    doc.fontSize(8).fillColor(gray).font("Helvetica-Bold").text("ORDER DATE", 400, 112);
    doc.fontSize(10).fillColor("#222").font("Helvetica").text(order.orderDate, 400, 124);
    doc.fontSize(8).fillColor(gray).font("Helvetica-Bold").text("STATUS", 400, 142);
    doc.fontSize(10).fillColor("#222").font("Helvetica").text(order.status, 400, 154);

    let y = order.customerPo ? 175 : 162;

    if (order.notes) {
      doc.fontSize(9).fillColor("#555").font("Helvetica-Oblique").text(`Notes: ${order.notes}`, 50, y);
      y += 20;
    }

    y += 10;

    // Table header
    const colX = [50, 150, 380, 430, 490];
    const colW = [95, 225, 45, 55, 70];
    const headers = ["SKU", "Product", "Qty", "Ship Date", "Ship From"];

    doc.rect(50, y, 510, 20).fill(light);
    doc.fontSize(9).fillColor(blue).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      const align = i === 2 ? "right" : "left";
      doc.text(h, colX[i], y + 5, { width: colW[i], align });
    });
    y += 20;

    doc.moveTo(50, y).lineTo(560, y).strokeColor(blue).lineWidth(0.5).stroke();

    // Table rows
    doc.font("Helvetica").fontSize(9).fillColor("#222");
    lines.forEach((l, idx) => {
      if (idx % 2 === 1) doc.rect(50, y, 510, 18).fill("#fafafa");
      doc.fillColor("#222");
      doc.text(l.sku, colX[0], y + 4, { width: colW[0] });
      doc.text(l.productName, colX[1], y + 4, { width: colW[1] });
      doc.text(String(l.quantity), colX[2], y + 4, { width: colW[2], align: "right" });
      doc.text(l.shipDate, colX[3], y + 4, { width: colW[3] });
      doc.text(l.warehouseName || "—", colX[4], y + 4, { width: colW[4] });
      doc.moveTo(50, y + 18).lineTo(560, y + 18).strokeColor("#e0e0e0").lineWidth(0.3).stroke();
      y += 18;
    });

    // Footer
    doc.fontSize(9).fillColor(gray).font("Helvetica")
      .text("Hotel Collection Inc.", 50, y + 30, { align: "center", width: 510 });

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

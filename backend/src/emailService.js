const { Resend } = require("resend");
const XLSX = require("xlsx");
const PdfPrinter = require("pdfmake/src/printer");

const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

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
  const printer = new PdfPrinter(fonts);

  const tableBody = [
    [
      { text: "SKU", style: "tableHeader" },
      { text: "Product", style: "tableHeader" },
      { text: "Qty", style: "tableHeader", alignment: "right" },
      { text: "Ship Date", style: "tableHeader" },
      { text: "Ship From", style: "tableHeader" },
    ],
    ...lines.map((l) => [
      { text: l.sku, font: "Helvetica" },
      { text: l.productName, font: "Helvetica" },
      { text: String(l.quantity), alignment: "right", font: "Helvetica" },
      { text: l.shipDate, font: "Helvetica" },
      { text: l.warehouseName || "—", font: "Helvetica" },
    ]),
  ];

  const docDef = {
    defaultStyle: { font: "Helvetica", fontSize: 10 },
    content: [
      { text: "ORDER CONFIRMATION", style: "title" },
      { text: order.orderNumber, style: "orderNum" },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#1677ff" }], margin: [0, 8, 0, 16] },
      {
        columns: [
          {
            stack: [
              { text: "BILL TO", style: "label" },
              { text: order.customer, style: "value", bold: true },
              ...(order.customerPo ? [{ text: `PO # ${order.customerPo}`, style: "value" }] : []),
            ],
          },
          {
            stack: [
              { text: "ORDER DATE", style: "label" },
              { text: order.orderDate, style: "value" },
              { text: "STATUS", style: "label", margin: [0, 8, 0, 0] },
              { text: order.status, style: "value" },
            ],
            alignment: "right",
          },
        ],
        margin: [0, 0, 0, 20],
      },
      ...(order.notes ? [{ text: `Notes: ${order.notes}`, italics: true, color: "#555", margin: [0, 0, 0, 12] }] : []),
      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "auto", "auto", "auto"],
          body: tableBody,
        },
        layout: {
          hLineWidth: (i) => (i === 0 || i === 1 ? 1 : 0.5),
          vLineWidth: () => 0,
          hLineColor: (i) => (i === 0 || i === 1 ? "#1677ff" : "#e0e0e0"),
          fillColor: (i) => (i === 0 ? "#f0f5ff" : i % 2 === 0 ? "#fafafa" : null),
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
      { text: "Hotel Collection Inc.", style: "footer", margin: [0, 30, 0, 0] },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: "#1677ff", font: "Helvetica" },
      orderNum: { fontSize: 13, color: "#333", font: "Helvetica" },
      label: { fontSize: 8, color: "#888", bold: true, font: "Helvetica", margin: [0, 0, 0, 2] },
      value: { fontSize: 10, color: "#222", font: "Helvetica" },
      tableHeader: { bold: true, fontSize: 10, color: "#1677ff", font: "Helvetica" },
      footer: { fontSize: 9, color: "#aaa", font: "Helvetica", alignment: "center" },
    },
  };

  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument(docDef);
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
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

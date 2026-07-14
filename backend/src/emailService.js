const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "onboarding@resend.dev";

async function sendEmail({ to, subject, html }) {
  const result = await resend.emails.send({ from: FROM, to, subject, html });
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

module.exports = { sendEmail, invoiceHtml, routingHtml };

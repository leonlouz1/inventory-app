// Clears CRM people data — contacts, their history, the old per-category
// buyer/status table and the sent tracker — so a fresh spreadsheet import
// starts clean. Retailers (names, types, billing addresses) are kept.
//
//   DATABASE_URL=... node scripts/wipe-crm-people.js        (dry run: counts only)
//   DATABASE_URL=... node scripts/wipe-crm-people.js --yes  (delete)
require("dotenv").config();
const prisma = require("../src/prismaClient");

(async () => {
  console.log({
    contacts: await prisma.crmContact.count(),
    history: await prisma.activityLog.count(),
    categoryRows: await prisma.retailerCategory.count(),
    sentItems: await prisma.sentItem.count(),
    retailersKept: await prisma.retailer.count(),
  });
  if (!process.argv.includes("--yes")) {
    console.log("Dry run. Re-run with --yes to delete.");
    return;
  }
  await prisma.$transaction([
    prisma.activityLog.deleteMany(),
    prisma.sentItem.deleteMany(),
    prisma.retailerCategory.deleteMany(),
    prisma.crmContact.deleteMany(),
  ]);
  console.log("Wiped. Retailers kept:", await prisma.retailer.count());
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

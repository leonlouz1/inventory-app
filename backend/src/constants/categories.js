const PRODUCT_CATEGORIES = [
  "Neck Pillows",
  "Luggage Sets",
  "Duffle Bags",
  "Travel Accessories",
  "Slippers",
  "Bath Mats",
  "Bed Sheets",
  "Comforter Sets",
  "Pet Accessories",
  "Training Pads",
  "Towels",
  "Soap Pumps",
  "Storage & Organization",
];

// Case pack (units per case) filled in automatically for new products in
// these categories when none is given.
const DEFAULT_CASE_PACK = { "Neck Pillows": 24 };

function defaultCasePack(category) {
  return DEFAULT_CASE_PACK[category] ?? null;
}

module.exports = { PRODUCT_CATEGORIES, DEFAULT_CASE_PACK, defaultCasePack };

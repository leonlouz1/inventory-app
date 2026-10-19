// UPC-A layout used for new products:
//   689528 | BB | SS | C | check digit
//   company prefix, brand, style, color, check digit.
// The 5 middle digits (BB SS C) are also the product's SKU.

const COMPANY_PREFIX = "689528";
const FIRST_BRAND = 24;
const LAST_BRAND = 29;

const CODE_LENGTH = { brand: 2, style: 2, color: 1 };

function checkDigit(first11) {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(first11[i]);
    if (i % 2 === 0) odd += d;
    else even += d;
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

function fullUpc(sku) {
  const first11 = COMPANY_PREFIX + sku;
  return first11 + checkDigit(first11);
}

function isValidSku(sku) {
  if (!/^\d{5}$/.test(sku)) return false;
  const brand = Number(sku.slice(0, 2));
  return brand >= FIRST_BRAND && brand <= LAST_BRAND;
}

function splitSku(sku) {
  return { brand: sku.slice(0, 2), style: sku.slice(2, 4), color: sku.slice(4, 5) };
}

module.exports = { COMPANY_PREFIX, FIRST_BRAND, LAST_BRAND, CODE_LENGTH, checkDigit, fullUpc, isValidSku, splitSku };

// What a file kept on an order is. Keep in sync with
// frontend/src/constants/documentKinds.js
const DOCUMENT_KIND_LABELS = {
  PO: "PO",
  REVISED_PO: "Revised PO",
  SIGNED_BOL: "Signed BOL",
  ROUTING: "Routing confirmation",
  PACKING_LIST: "Packing list",
  INVOICE: "Invoice",
  OTHER: "Other",
};
const DOCUMENT_KINDS = Object.keys(DOCUMENT_KIND_LABELS);

module.exports = { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS };

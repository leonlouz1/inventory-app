// What a file kept on an order is. Keep in sync with
// backend/src/constants/documentKinds.js
export const DOCUMENT_KINDS = [
  { value: "PO", label: "PO", color: "blue" },
  { value: "REVISED_PO", label: "Revised PO", color: "geekblue" },
  { value: "SIGNED_BOL", label: "Signed BOL", color: "green" },
  { value: "ROUTING", label: "Routing confirmation", color: "cyan" },
  { value: "PACKING_LIST", label: "Packing list", color: "purple" },
  { value: "INVOICE", label: "Invoice", color: "gold" },
  { value: "OTHER", label: "Other", color: "default" },
];

export const DOCUMENT_KIND_BY_VALUE = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k.value, k]));

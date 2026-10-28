import dayjs from "dayjs";

// CRM vocabulary. Keep in sync with backend/src/constants/crm.js.
export const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
export const CONTACT_CATEGORIES = [...CRM_CATEGORIES, "Other"];
export const CONTACT_ROLES = ["Buyer", "DMM", "MA/Assistant", "Accounts Payable", "Logistics", "Other"];
export const STATUSES = ["Active", "Order Placed", "Warm", "Not Contacted", "No Response", "Not Interested", "No Contact Found", "N/A"];
export const STATUS_COLORS = {
  Active: "green", "Order Placed": "blue", Warm: "orange", "Not Contacted": "default",
  "No Response": "purple", "Not Interested": "red", "No Contact Found": "default", "N/A": "default",
};
export const LOG_ACTIONS = ["Called", "Emailed", "Sent Sample", "Meeting", "PO Received"];
export const ACTION_COLORS = {
  Called: "blue", Emailed: "geekblue", "Sent Sample": "orange", Meeting: "purple", "PO Received": "green", Note: "default",
};
// "Note" entries came from the old spreadsheet's Notes column
export const ACTION_LABELS = { Note: "From sheet" };

// Default days until the next follow-up (null = no follow-up)
export const FOLLOW_UP_DAYS = { Called: 3, Emailed: 3, "Sent Sample": 7, Meeting: 7, "PO Received": null };

export function defaultFollowUp(action, from = dayjs()) {
  const days = FOLLOW_UP_DAYS[action];
  return days === null || days === undefined ? null : from.add(days, "day");
}

const SELLING = ["Active", "Order Placed"];
export function statusAfter(action, current) {
  if (action === "PO Received") return "Active";
  if (action === "Sent Sample" || action === "Meeting") return SELLING.includes(current) ? current : "Warm";
  if (action === "Called" || action === "Emailed") {
    return ["Not Contacted", "No Contact Found", "N/A"].includes(current) ? "No Response" : current;
  }
  return current;
}

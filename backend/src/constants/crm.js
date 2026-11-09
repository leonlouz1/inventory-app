// CRM vocabulary shared by the routes and the spreadsheet import.
// Keep in sync with frontend/src/constants/crm.js.

const CRM_CATEGORIES = ["Travel", "Bedding", "Pet", "Bath", "Slippers", "Storage"];
const CONTACT_CATEGORIES = [...CRM_CATEGORIES, "Non-buying", "Other"];
const CONTACT_ROLES = ["Buyer", "DMM", "MA/Assistant", "Accounts Payable", "Logistics", "Other"];
const STATUSES = ["Active", "Order Placed", "Warm", "Not Contacted", "No Response", "Not Interested", "No Contact Found", "N/A"];
const LOG_ACTIONS = ["Called", "Emailed", "Sent Sample", "Meeting", "PO Received"];
// "Note" is only written by the spreadsheet import (the old Notes cell);
// "Pitch Result" when a pitched buyer says they do or don't buy a category
// "Meeting Scheduled" is written by the meetings routes (CRM → Meetings)
const ALL_ACTIONS = [...LOG_ACTIONS, "Note", "Pitch Result", "Meeting Scheduled"];
const MEETING_LOCATIONS = ["5th Ave Showroom", "Online call", "Buyer's office"];

// Days until the next follow-up when an action is logged (null = clear it)
const FOLLOW_UP_DAYS = { Called: 3, Emailed: 3, "Sent Sample": 7, Meeting: 7, "PO Received": null };

const SELLING = ["Active", "Order Placed"];

// Status a buyer moves to after an action is logged
function statusAfter(action, current) {
  if (action === "PO Received") return "Active";
  if (action === "Sent Sample" || action === "Meeting" || action === "Meeting Scheduled") return SELLING.includes(current) ? current : "Warm";
  if (action === "Called" || action === "Emailed") {
    return ["Not Contacted", "No Contact Found", "N/A"].includes(current) ? "No Response" : current;
  }
  return current;
}

module.exports = {
  CRM_CATEGORIES, CONTACT_CATEGORIES, CONTACT_ROLES, STATUSES, LOG_ACTIONS, ALL_ACTIONS, MEETING_LOCATIONS, FOLLOW_UP_DAYS, statusAfter,
};

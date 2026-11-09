import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { crmApi } from "../api/inventory";

// Meeting form state helpers shared by the buyer panel's log form and the Meetings page

// Names used before for our side of a meeting, offered as suggestions
export function useTeamNames() {
  const [names, setNames] = useState([]);
  useEffect(() => { crmApi.meetingTeamNames().then(setNames).catch(() => {}); }, []);
  return names;
}

// Tomorrow at 11 AM in the showroom, a sensible default for a new meeting
export function blankMeeting() {
  return {
    startsAt: dayjs().add(1, "day").hour(11).minute(0).second(0),
    locationType: "5th Ave Showroom",
    address: "",
    link: "",
    attendeeIds: [],
    ourAttendees: [],
  };
}

export function meetingFromApi(m) {
  return {
    startsAt: dayjs(m.startsAt),
    locationType: m.locationType,
    address: m.address || "",
    link: m.link || "",
    attendeeIds: m.attendees.map((a) => a.id),
    ourAttendees: m.ourAttendees,
  };
}

export function meetingPayload(v) {
  return {
    startsAt: v.startsAt.toISOString(),
    locationType: v.locationType,
    address: v.locationType === "Buyer's office" ? v.address : null,
    link: v.locationType === "Online call" ? v.link : null,
    attendeeIds: v.attendeeIds,
    ourAttendees: v.ourAttendees,
  };
}

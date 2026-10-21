import dayjs from "dayjs";
import { Tag, Tooltip } from "antd";

// An order's cancel date ("do not ship after"), with a warning when it has
// passed and the order hasn't shipped, or when the ship date is after it.
export default function CancelDateTag({ order }) {
  if (!order.cancelDate) return <span style={{ color: "#bbb" }}>—</span>;
  const open = order.status !== "SHIPPED" && order.status !== "CANCELLED";
  const shipDate = order.earliestShipDate || order.lines?.[0]?.shipDate;
  const today = dayjs().format("YYYY-MM-DD");
  const label = dayjs(order.cancelDate).format("MMM D, YYYY");
  if (open && order.cancelDate < today) {
    return <Tooltip title="Cancel date has passed and the order hasn't shipped"><Tag color="red">{label} · past cancel</Tag></Tooltip>;
  }
  if (open && shipDate && shipDate > order.cancelDate) {
    return <Tooltip title={`Ship date ${shipDate} is after the cancel date`}><Tag color="orange">{label} · ships after</Tag></Tooltip>;
  }
  return <span>{label}</span>;
}

import { Tag } from "antd";
import { TARGET_MARGIN } from "../utils/landedCost";

// Margin %: red under the target, gold within 10 points of it, green above
export default function MarginTag({ value }) {
  if (value == null) return <span style={{ color: "#bbb" }}>—</span>;
  const color = value < TARGET_MARGIN ? "red" : value < TARGET_MARGIN + 10 ? "gold" : "green";
  return <Tag color={color}>{value.toFixed(1)}%</Tag>;
}

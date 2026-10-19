import { Tag } from "antd";

// Projected stock at a line's ship date: green if covered, red with the deficit
export default function ProjectionTag({ projection }) {
  if (!projection) return null;
  return projection.ok ? (
    <Tag color="green">✓ {projection.balance}</Tag>
  ) : (
    <Tag color="red">⚠ {projection.balance} (deficit {projection.deficit})</Tag>
  );
}

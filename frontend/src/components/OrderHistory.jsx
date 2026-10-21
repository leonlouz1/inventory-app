import dayjs from "dayjs";
import { Card, Table, Tag, Typography } from "antd";

const FIELD_COLORS = {
  SKU: "purple",
  Quantity: "blue",
  "Line added": "green",
  "Line removed": "red",
  Status: "geekblue",
  "Order created": "default",
};

// An order's change history, newest first: what changed (before -> after),
// on which SKU, who did it and when
export default function OrderHistory({ changes }) {
  return (
    <Card size="small" title={`History (${changes.length})`} style={{ marginTop: 16 }}>
      <Table
        size="small"
        rowKey="id"
        dataSource={changes}
        pagination={{ pageSize: 15, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "No changes recorded yet" }}
        columns={[
          {
            title: "When",
            dataIndex: "createdAt",
            width: 160,
            render: (v) => <span title={dayjs(v).format("YYYY-MM-DD HH:mm:ss")}>{dayjs(v).format("MMM D, YYYY h:mm A")}</span>,
          },
          { title: "Who", dataIndex: "userName", render: (v) => v || "—" },
          { title: "What", dataIndex: "field", render: (f) => <Tag color={FIELD_COLORS[f]}>{f}</Tag> },
          { title: "SKU", dataIndex: "sku", render: (v) => v || "" },
          {
            title: "Change",
            key: "change",
            render: (_, c) => {
              if (c.before != null && c.after != null) {
                return <span><span style={{ color: "#8c8c8c", textDecoration: "line-through" }}>{c.before}</span> → <strong>{c.after}</strong></span>;
              }
              return <strong>{c.after ?? c.before ?? ""}</strong>;
            },
          },
          { title: "Note", dataIndex: "note", render: (v) => (v ? <Typography.Text type="secondary">{v}</Typography.Text> : null) },
        ]}
      />
    </Card>
  );
}

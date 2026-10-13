import { useEffect, useState, useMemo } from "react";
import { Table, Button, Tag, Spin, Alert, Typography, Tabs, Space, Popconfirm, message, Input } from "antd";
import { CheckCircleOutlined, MailOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { billingApi } from "../api/inventory";
import EmailOrderModal from "../components/EmailOrderModal";

export default function Billing() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [emailOrder, setEmailOrder] = useState(null);
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    billingApi
      .list()
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleMarkInvoiced(order, invoiced) {
    try {
      const { invoicedAt } = await billingApi.markInvoiced(order.id, invoiced);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, invoicedAt } : o))
      );
      message.success(invoiced ? `${order.orderNumber} marked as invoiced` : `${order.orderNumber} moved back to pending`);
    } catch (err) {
      message.error(err.message);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(term) ||
        o.customer.toLowerCase().includes(term) ||
        (o.customerPo || "").toLowerCase().includes(term)
    );
  }, [orders, search]);

  const pending = useMemo(() => filtered.filter((o) => !o.invoicedAt), [filtered]);
  const invoiced = useMemo(() => filtered.filter((o) => !!o.invoicedAt), [filtered]);

  const columns = (showInvoicedAt) => [
    {
      title: "Order #",
      dataIndex: "orderNumber",
      sorter: (a, b) => a.orderNumber.localeCompare(b.orderNumber),
    },
    {
      title: "Customer",
      dataIndex: "customer",
      sorter: (a, b) => a.customer.localeCompare(b.customer),
    },
    {
      title: "PO #",
      dataIndex: "customerPo",
      render: (v) => v || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      title: "Order Date",
      dataIndex: "orderDate",
      render: (v) => v ? dayjs(v).format("MMM D, YYYY") : "—",
      sorter: (a, b) => (a.orderDate || "").localeCompare(b.orderDate || ""),
    },
    {
      title: "Lines",
      key: "lines",
      render: (_, o) => o.lines.length,
    },
    ...(showInvoicedAt
      ? [
          {
            title: "Invoiced On",
            dataIndex: "invoicedAt",
            render: (v) => v ? dayjs(v).format("MMM D, YYYY") : "—",
            sorter: (a, b) => (a.invoicedAt || "").localeCompare(b.invoicedAt || ""),
          },
        ]
      : []),
    {
      title: "",
      key: "actions",
      render: (_, order) => (
        <Space>
          <Button
            icon={<MailOutlined />}
            size="small"
            onClick={() => setEmailOrder(order)}
          >
            Send Invoice
          </Button>
          {!order.invoicedAt ? (
            <Button
              icon={<CheckCircleOutlined />}
              type="primary"
              size="small"
              onClick={() => handleMarkInvoiced(order, true)}
            >
              Mark Invoiced
            </Button>
          ) : (
            <Popconfirm
              title="Move back to pending?"
              onConfirm={() => handleMarkInvoiced(order, false)}
            >
              <Button icon={<UndoOutlined />} size="small">
                Unmark
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Billing
        </Typography.Title>
        <Input.Search
          placeholder="Search order #, customer, or PO"
          allowClear
          style={{ width: 280 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Tabs
        items={[
          {
            key: "pending",
            label: (
              <span>
                Pending Invoice{" "}
                <Tag color="orange" style={{ marginLeft: 4 }}>{pending.length}</Tag>
              </span>
            ),
            children: (
              <Table
                columns={columns(false)}
                dataSource={pending}
                rowKey="id"
                size="small"
                pagination={{ defaultPageSize: 20, showSizeChanger: true }}
                locale={{ emptyText: "No orders pending invoice" }}
              />
            ),
          },
          {
            key: "invoiced",
            label: (
              <span>
                Invoiced{" "}
                <Tag color="green" style={{ marginLeft: 4 }}>{invoiced.length}</Tag>
              </span>
            ),
            children: (
              <Table
                columns={columns(true)}
                dataSource={invoiced}
                rowKey="id"
                size="small"
                pagination={{ defaultPageSize: 20, showSizeChanger: true }}
                locale={{ emptyText: "No invoiced orders yet" }}
              />
            ),
          },
        ]}
      />

      {emailOrder && (
        <EmailOrderModal
          open
          order={emailOrder}
          onClose={() => setEmailOrder(null)}
        />
      )}
    </Spin>
  );
}

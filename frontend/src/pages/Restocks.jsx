import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table, Button, Tag, Spin, Alert, Typography, Popconfirm, message } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { restocksApi, productsApi, warehousesApi } from "../api/inventory";
import { NewRestockModal, EditRestockModal } from "../components/RestockModals";

// Groups flat restock rows back into shipments: rows sharing a shipmentId
// (logged together via "Add SKU" in the modal) become one expandable row;
// standalone rows (no shipmentId, including legacy data) are their own group.
function groupByShipment(restocks) {
  const groups = new Map();
  for (const r of restocks) {
    const key = r.shipmentId || `single-${r.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        expectedDate: r.expectedDate,
        supplier: r.supplier,
        lines: [],
      });
    }
    groups.get(key).lines.push(r);
  }
  return [...groups.values()].sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

export default function Restocks() {
  const [restocks, setRestocks] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingRestock, setEditingRestock] = useState(null);

  const loadRestocks = useCallback(() => {
    setLoading(true);
    return restocksApi
      .list()
      .then((data) => {
        setRestocks(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRestocks();
    productsApi.list().then(setProducts);
    warehousesApi.list().then(setWarehouses);
  }, [loadRestocks]);

  async function handleDelete(id) {
    try {
      await restocksApi.delete(id);
      message.success("Restock deleted");
      loadRestocks();
    } catch (err) {
      message.error(`Failed to delete restock: ${err.message}`);
    }
  }

  const shipments = useMemo(() => groupByShipment(restocks), [restocks]);

  const columns = [
    {
      title: "SKU",
      key: "sku",
      render: (_, group) =>
        group.lines.length === 1 ? (
          <Link to={`/timeline?sku=${encodeURIComponent(group.lines[0].sku)}`} onClick={(e) => e.stopPropagation()}>
            {group.lines[0].sku}
          </Link>
        ) : (
          <Tag>{group.lines.length} SKUs</Tag>
        ),
    },
    {
      title: "Product Name",
      key: "productName",
      render: (_, group) => (group.lines.length === 1 ? group.lines[0].productName : "—"),
    },
    { title: "Warehouse", dataIndex: "warehouseName" },
    {
      title: "Units Arriving",
      key: "quantity",
      align: "right",
      render: (_, group) => group.lines.reduce((sum, l) => sum + l.quantity, 0),
    },
    { title: "Expected Date", dataIndex: "expectedDate" },
    { title: "Supplier / PO", dataIndex: "supplier", render: (v) => v || "—" },
    {
      title: "",
      key: "actions",
      render: (_, group) =>
        group.lines.length === 1 && (
          <>
            <Button icon={<EditOutlined />} type="text" onClick={() => setEditingRestock(group.lines[0])} />
            <Popconfirm title="Delete this restock?" onConfirm={() => handleDelete(group.lines[0].id)}>
              <Button icon={<DeleteOutlined />} danger type="text" />
            </Popconfirm>
          </>
        ),
    },
  ];

  if (error) {
    return <Alert type="error" message="Failed to load restocks" description={error} showIcon />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Restocks
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Log Restock
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={shipments}
        rowKey="key"
        pagination={{ pageSize: 20 }}
        expandable={{
          rowExpandable: (group) => group.lines.length > 1,
          expandedRowRender: (group) => {
            const lineColumns = [
              {
                title: "SKU",
                dataIndex: "sku",
                render: (sku) => <Link to={`/timeline?sku=${encodeURIComponent(sku)}`}>{sku}</Link>,
              },
              { title: "Product Name", dataIndex: "productName" },
              { title: "Qty", dataIndex: "quantity" },
              {
                title: "",
                key: "actions",
                render: (_, restock) => (
                  <>
                    <Button icon={<EditOutlined />} type="text" onClick={() => setEditingRestock(restock)} />
                    <Popconfirm title="Delete this restock?" onConfirm={() => handleDelete(restock.id)}>
                      <Button icon={<DeleteOutlined />} danger type="text" />
                    </Popconfirm>
                  </>
                ),
              },
            ];
            return <Table columns={lineColumns} dataSource={group.lines} rowKey="id" pagination={false} size="small" />;
          },
        }}
      />

      <NewRestockModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadRestocks}
        products={products}
        warehouses={warehouses}
      />

      <EditRestockModal
        open={!!editingRestock}
        onClose={() => setEditingRestock(null)}
        onUpdated={loadRestocks}
        restock={editingRestock}
        warehouses={warehouses}
      />
    </Spin>
  );
}

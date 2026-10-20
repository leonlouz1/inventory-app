import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Table, Button, Tag, Spin, Alert, Typography, Popconfirm, Select, Input, Space, Segmented, message } from "antd";
import { PlusOutlined, DeleteOutlined, UploadOutlined, InboxOutlined, ScissorOutlined } from "@ant-design/icons";
import { containersApi, productsApi, warehousesApi, ordersApi } from "../api/inventory";
import {
  ContainerFormModal, ReceiveContainerModal, SplitContainerModal, DifferenceTag,
} from "../components/ContainerModals";
import { CONTAINER_STATUS_OPTIONS, CONTAINER_STATUS_COLORS, CONTAINER_STATUS_LABELS } from "../constants/containers";
import BulkImportRestocksModal from "../components/BulkImportRestocksModal";

// Restocks arrive in containers: one row per container, with its SKUs,
// ordered vs received units and the difference once it's received.
export default function Restocks() {
  const [containers, setContainers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("INCOMING");
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [splitting, setSplitting] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return containersApi
      .list()
      .then((data) => {
        setContainers(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    productsApi.list().then(setProducts);
    warehousesApi.list().then(setWarehouses);
    ordersApi.list().then(setOrders);
  }, [load]);

  async function handleStatus(container, status) {
    try {
      const updated = await containersApi.update(container.id, { status });
      setContainers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleDelete(container) {
    try {
      await containersApi.delete(container.id);
      message.success("Container deleted");
      load();
    } catch (err) {
      message.error(err.message);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return containers.filter((c) => {
      if (view === "INCOMING" && c.status === "RECEIVED") return false;
      if (view !== "INCOMING" && view !== "ALL" && c.status !== view) return false;
      if (!term) return true;
      return [c.containerNumber, c.poNumber, c.supplier, c.blNumber, ...c.lines.map((l) => l.sku)]
        .some((v) => v && v.toLowerCase().includes(term));
    });
  }, [containers, search, view]);

  const columns = [
    {
      title: "Container #",
      dataIndex: "containerNumber",
      render: (n, c) => <Link to={`/restocks/${c.id}`}>{n || <span style={{ color: "#8c8c8c" }}>No # yet</span>}</Link>,
    },
    { title: "PO #", dataIndex: "poNumber", render: (v) => v || "—" },
    { title: "Supplier", dataIndex: "supplier", render: (v) => v || "—" },
    { title: "Warehouse", dataIndex: "warehouseName" },
    { title: "ETD", dataIndex: "etd", render: (v) => v || "—" },
    { title: "ETA", dataIndex: "eta", sorter: (a, b) => a.eta.localeCompare(b.eta), defaultSortOrder: "ascend" },
    {
      title: "SKUs",
      key: "skus",
      render: (_, c) => (c.skuCount === 1
        ? <Link to={`/products/${encodeURIComponent(c.lines[0].sku)}`}>{c.lines[0].sku}</Link>
        : <Tag>{c.skuCount} SKUs</Tag>),
    },
    { title: "Ordered", dataIndex: "orderedUnits", align: "right" },
    {
      title: "Received",
      key: "received",
      align: "right",
      render: (_, c) => (c.receivedUnits == null ? "—" : <span>{c.receivedUnits} <DifferenceTag value={c.difference} /></span>),
    },
    {
      title: "Status",
      key: "status",
      render: (_, c) => (c.status === "RECEIVED"
        ? <Tag color={CONTAINER_STATUS_COLORS.RECEIVED}>Received {c.receivedAt ? c.receivedAt.slice(0, 10) : ""}</Tag>
        : <Select size="small" value={c.status} style={{ width: 140 }} options={CONTAINER_STATUS_OPTIONS} onChange={(v) => handleStatus(c, v)} />),
    },
    {
      title: "",
      key: "actions",
      render: (_, c) => (
        <Space size={4}>
          {c.status !== "RECEIVED" && (
            <>
              <Button size="small" type="primary" icon={<InboxOutlined />} onClick={() => setReceiving(c)}>Receive</Button>
              <Button size="small" icon={<ScissorOutlined />} title="Split into another container" onClick={() => setSplitting(c)} />
            </>
          )}
          <Popconfirm
            title="Delete this container?"
            description={c.status === "RECEIVED" ? "Its received stock will be taken back out." : undefined}
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(c)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (error) return <Alert type="error" message="Failed to load containers" description={error} showIcon />;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Restocks — Containers</Typography.Title>
        <Space wrap>
          <Input.Search placeholder="Container, PO, supplier, SKU" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
          <Button icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Log container</Button>
        </Space>
      </div>

      <Segmented
        value={view}
        onChange={setView}
        style={{ marginBottom: 16, maxWidth: "100%", overflowX: "auto" }}
        options={[
          { value: "INCOMING", label: `Incoming (${containers.filter((c) => c.status !== "RECEIVED").length})` },
          ...["IN_PRODUCTION", "EN_ROUTE", "ON_HOLD", "DRAFT", "RECEIVED"].map((s) => ({
            value: s,
            label: `${CONTAINER_STATUS_LABELS[s]} (${containers.filter((c) => c.status === s).length})`,
          })),
          { value: "ALL", label: `All (${containers.length})` },
        ]}
      />

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size="middle"
        scroll={{ x: "max-content" }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
        expandable={{
          expandedRowRender: (c) => (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={c.lines}
              columns={[
                { title: "SKU", dataIndex: "sku", render: (sku) => <Link to={`/products/${encodeURIComponent(sku)}`}>{sku}</Link> },
                { title: "Product", dataIndex: "productName" },
                { title: "Ordered", dataIndex: "orderedQuantity", align: "right" },
                { title: "Received", dataIndex: "receivedQuantity", align: "right", render: (v) => (v == null ? "—" : v) },
                { title: "Difference", dataIndex: "difference", align: "right", render: (v) => <DifferenceTag value={v} /> },
                {
                  title: "Linked Order",
                  dataIndex: "linkedOrderNumber",
                  render: (n, l) => (n ? <Link to={`/orders/${l.linkedOrderId}`}>{n}</Link> : "—"),
                },
              ]}
            />
          ),
        }}
      />

      {creating && (
        <ContainerFormModal
          warehouses={warehouses}
          products={products}
          orders={orders}
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
      {receiving && <ReceiveContainerModal container={receiving} onClose={() => setReceiving(null)} onReceived={load} />}
      {splitting && <SplitContainerModal container={splitting} onClose={() => setSplitting(null)} onSplit={load} />}
      <BulkImportRestocksModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={load}
        products={products}
        warehouses={warehouses}
        orders={orders}
      />
    </Spin>
  );
}

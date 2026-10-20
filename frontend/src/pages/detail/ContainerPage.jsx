import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import {
  Alert, Button, Card, Descriptions, InputNumber, Modal, Popconfirm, Select, Space, Spin, Statistic, Row, Col, Table, Tag, Typography,
  message,
} from "antd";
import {
  ArrowLeftOutlined, DeleteOutlined, EditOutlined, InboxOutlined, PlusOutlined, RollbackOutlined, ScissorOutlined,
} from "@ant-design/icons";
import { containersApi, ordersApi, productsApi, warehousesApi } from "../../api/inventory";
import {
  ContainerFormModal, ReceiveContainerModal, SplitContainerModal, DifferenceTag,
} from "../../components/ContainerModals";
import { CONTAINER_STATUS_COLORS, CONTAINER_STATUS_LABELS } from "../../constants/containers";

// One container on its own page: /restocks/:id
export default function ContainerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [container, setContainer] = useState(null);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [orders, setOrders] = useState([]);
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [newLine, setNewLine] = useState(null); // { sku, quantity } while adding

  const load = useCallback(
    () => containersApi.get(id).then(setContainer).catch((err) => setError(err.message)),
    [id]
  );

  useEffect(() => {
    load();
    Promise.all([productsApi.list(), warehousesApi.list(), ordersApi.list()]).then(([p, w, o]) => {
      setProducts(p);
      setWarehouses(w);
      setOrders(o);
    });
  }, [load]);

  async function run(fn, done) {
    try {
      const updated = await fn();
      if (updated?.id) setContainer(updated);
      else load();
      if (done) message.success(done);
    } catch (err) {
      message.error(err.message);
    }
  }

  function undoReceive() {
    Modal.confirm({
      title: "Undo receive?",
      content: "This takes the received quantities back out of stock and sets the container back to En Route.",
      okText: "Undo receive",
      onOk: () => run(() => containersApi.unreceive(container.id), "Receive undone"),
    });
  }

  if (error) return <Alert type="error" message="Couldn't load this container" description={error} showIcon />;
  if (!container) return <Spin />;

  const received = container.status === "RECEIVED";
  const columns = [
    { title: "SKU", dataIndex: "sku", render: (sku) => <Link to={`/products/${encodeURIComponent(sku)}`}>{sku}</Link> },
    { title: "Product", dataIndex: "productName" },
    {
      title: "Ordered",
      dataIndex: "orderedQuantity",
      align: "right",
      render: (qty, l) => (
        <span>
          {qty}
          {l.casePack ? <span style={{ color: "#888", fontSize: 12 }}> ({Math.ceil(qty / l.casePack)} cs)</span> : null}
        </span>
      ),
    },
    { title: "Received", dataIndex: "receivedQuantity", align: "right", render: (v) => (v == null ? "—" : v) },
    { title: "Difference", dataIndex: "difference", align: "right", render: (v) => <DifferenceTag value={v} /> },
    { title: "Linked Order", dataIndex: "linkedOrderNumber", render: (n, l) => (n ? <Link to={`/orders/${l.linkedOrderId}`}>{n}</Link> : "—") },
    {
      title: "",
      key: "actions",
      render: (_, l) => !received && (
        <Space size={4}>
          <Button
            type="text"
            icon={<EditOutlined />}
            title="Change ordered quantity"
            onClick={() => {
              let qty = l.orderedQuantity;
              Modal.confirm({
                title: `Ordered quantity — ${l.sku}`,
                icon: null,
                content: <InputNumber min={1} precision={0} defaultValue={qty} onChange={(v) => { qty = v; }} style={{ width: "100%" }} />,
                okText: "Save",
                onOk: () => run(() => containersApi.updateLine(container.id, l.id, { quantity: qty })),
              });
            }}
          />
          <Popconfirm
            title="Remove this SKU from the container?"
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => run(() => containersApi.deleteLine(container.id, l.id))}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }} onClick={() => navigate(-1)}>
        Back
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Space align="center" wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>Container {container.containerNumber || "(no # yet)"}</Typography.Title>
          <Tag color={CONTAINER_STATUS_COLORS[container.status]}>{CONTAINER_STATUS_LABELS[container.status]}</Tag>
        </Space>
        <Space wrap>
          {!received && <Button type="primary" icon={<InboxOutlined />} onClick={() => setReceiving(true)}>Receive</Button>}
          {!received && <Button icon={<ScissorOutlined />} onClick={() => setSplitting(true)}>Split</Button>}
          {received && <Button icon={<RollbackOutlined />} onClick={undoReceive}>Undo receive</Button>}
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>
          <Popconfirm
            title="Delete this container?"
            description={received ? "Its received stock will be taken back out." : undefined}
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => containersApi.delete(container.id).then(() => navigate("/restocks")).catch((err) => message.error(err.message))}
          >
            <Button danger icon={<DeleteOutlined />}>Delete</Button>
          </Popconfirm>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="SKUs" value={container.skuCount} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Ordered units" value={container.orderedUnits} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Received units" value={container.receivedUnits ?? "—"} /></Card></Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Difference"
              value={container.difference == null ? "—" : container.difference > 0 ? `+${container.difference}` : container.difference}
              valueStyle={{ color: container.difference < 0 ? "#cf1322" : container.difference > 0 ? "#1677ff" : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="PO #">{container.poNumber || "—"}</Descriptions.Item>
          <Descriptions.Item label="Supplier">{container.supplier || "—"}</Descriptions.Item>
          <Descriptions.Item label="Warehouse">{container.warehouseName}</Descriptions.Item>
          <Descriptions.Item label="ETD">{container.etd || "—"}</Descriptions.Item>
          <Descriptions.Item label="ETA">{container.eta}</Descriptions.Item>
          <Descriptions.Item label="BL #">{container.blNumber || "—"}</Descriptions.Item>
          <Descriptions.Item label="Received">{container.receivedAt ? dayjs(container.receivedAt).format("MMM D, YYYY") : "—"}</Descriptions.Item>
          <Descriptions.Item label="Notes" span={2}>{container.notes || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>SKUs</Typography.Title>
        {!received && (newLine ? (
          <Space wrap>
            <Select
              showSearch
              placeholder="SKU"
              style={{ width: 280 }}
              value={newLine.sku}
              onChange={(sku) => setNewLine((n) => ({ ...n, sku }))}
              options={products.map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` }))}
              filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
            />
            <InputNumber min={1} precision={0} placeholder="Ordered qty" value={newLine.quantity} onChange={(q) => setNewLine((n) => ({ ...n, quantity: q }))} />
            <Button
              type="primary"
              disabled={!newLine.sku || !newLine.quantity}
              onClick={() => run(() => containersApi.addLine(container.id, newLine)).then(() => setNewLine(null))}
            >
              Add
            </Button>
            <Button onClick={() => setNewLine(null)}>Cancel</Button>
          </Space>
        ) : (
          <Button icon={<PlusOutlined />} onClick={() => setNewLine({})}>Add SKU</Button>
        ))}
      </div>
      <Table rowKey="id" size="small" columns={columns} dataSource={container.lines} pagination={false} scroll={{ x: "max-content" }} />

      {editing && (
        <ContainerFormModal
          container={container}
          warehouses={warehouses}
          products={products}
          orders={orders}
          onClose={() => setEditing(false)}
          onSaved={setContainer}
        />
      )}
      {receiving && <ReceiveContainerModal container={container} onClose={() => setReceiving(false)} onReceived={setContainer} />}
      {splitting && (
        <SplitContainerModal
          container={container}
          onClose={() => setSplitting(false)}
          onSplit={(created) => {
            load();
            message.info(
              <span>New container created: <Link to={`/restocks/${created.id}`}>{created.containerNumber || "open it"}</Link></span>,
              6
            );
          }}
        />
      )}
    </>
  );
}

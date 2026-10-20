import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Col, Descriptions, Image, Row, Space, Spin, Statistic, Table, Tag, Typography } from "antd";
import { ArrowLeftOutlined, BarcodeOutlined, EditOutlined, FieldTimeOutlined } from "@ant-design/icons";
import { productsApi, warehousesApi } from "../../api/inventory";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "../../constants/orderStatuses";
import { useRole } from "../../hooks/useRole";
import ProductWindow from "../../components/ProductWindow";
import BarcodeModal from "../../components/BarcodeModal";
import ShadowSkusCard from "../../components/ShadowSkusCard";

const orderLink = (n, row) => <Link to={`/orders/${row.orderId}`}>{n}</Link>;

// One product on its own page: /products/:sku
export default function ProductPage() {
  const { sku } = useParams();
  const navigate = useNavigate();
  const { isDesigner } = useRole();
  const [page, setPage] = useState(null);
  const [product, setProduct] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await productsApi.bySku(sku);
      const [full, w] = await Promise.all([productsApi.full(p.id), isDesigner ? [] : warehousesApi.list()]);
      setPage(p);
      setProduct(full);
      setWarehouses(w);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [sku, isDesigner]);

  useEffect(() => { load(); }, [load]);

  if (error) return <Alert type="error" message="Couldn't load this product" description={error} showIcon />;
  if (!product) return <Spin />;

  const onHand = product.stockByWarehouse ? Object.values(product.stockByWarehouse).reduce((s, n) => s + n, 0) : null;
  const committed = (page.openLines || []).filter((l) => l.status !== "DRAFT").reduce((s, l) => s + l.quantity, 0);
  const incoming = (page.restocks || []).filter((r) => r.status !== "DRAFT").reduce((s, r) => s + r.quantity, 0);
  const details = Object.entries(product.attributes || {}).filter(([, v]) => v);

  const orderColumns = [
    { title: "Order #", dataIndex: "orderNumber", render: orderLink },
    { title: "Customer", dataIndex: "customer", render: (c) => <Link to={`/customers?name=${encodeURIComponent(c)}`}>{c}</Link> },
    { title: "PO #", dataIndex: "customerPo", render: (v) => v || "—" },
    { title: "Qty", dataIndex: "quantity", align: "right" },
    { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
    { title: "Ship Date", dataIndex: "shipDate" },
    { title: "Status", dataIndex: "status", render: (s) => <Tag color={ORDER_STATUS_COLORS[s]}>{ORDER_STATUS_LABELS[s]}</Tag> },
  ];

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }} onClick={() => navigate(-1)}>
        Back
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <Space align="start" size={16}>
          {product.imageUrl
            ? <Image src={product.imageUrl} width={96} height={96} style={{ objectFit: "contain", borderRadius: 6 }} />
            : <div style={{ width: 96, height: 96, background: "#f5f5f5", borderRadius: 6 }} />}
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>{product.sku}</Typography.Title>
            <Typography.Text style={{ fontSize: 15 }}>{product.name}</Typography.Text>
            <div style={{ marginTop: 6 }}>
              {product.brand && <Tag>{product.brand}</Tag>}
              {product.category && <Tag>{product.category}</Tag>}
              {product.shadowParent && (
                <Tag color="purple">shadow of <Link to={`/products/${encodeURIComponent(product.shadowParent.sku)}`}>{product.shadowParent.sku}</Link></Tag>
              )}
              {product.shadows?.map((s) => (
                <Tag key={s.id} color="geekblue">shadow: <Link to={`/products/${encodeURIComponent(s.sku)}`}>{s.sku}</Link></Tag>
              ))}
            </div>
          </div>
        </Space>
        <Space wrap>
          <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>Edit</Button>
          {!isDesigner && (
            <Button icon={<FieldTimeOutlined />} onClick={() => navigate(`/timeline?sku=${encodeURIComponent(product.sku)}`)}>
              Timeline
            </Button>
          )}
          {product.upc && /^\d{12}$/.test(product.upc) && (
            <Button icon={<BarcodeOutlined />} onClick={() => setShowBarcode(true)}>Barcode</Button>
          )}
        </Space>
      </div>

      {!isDesigner && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="On hand" value={onHand} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="On open orders" value={committed} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Available to sell" value={onHand - committed} /></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Incoming" value={incoming} /></Card></Col>
        </Row>
      )}

      <Row gutter={16}>
        <Col xs={24} lg={isDesigner ? 24 : 12}>
          <Card size="small" title="Details" style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="UPC"><span style={{ fontFamily: "monospace" }}>{product.upc || "—"}</span></Descriptions.Item>
              <Descriptions.Item label="Case pack">{product.casePack || "—"}</Descriptions.Item>
              <Descriptions.Item label="Wholesale">{product.wholesalePrice != null ? `$${product.wholesalePrice.toFixed(2)}` : "—"}</Descriptions.Item>
              <Descriptions.Item label="Retail">{product.retailPrice != null ? `$${product.retailPrice.toFixed(2)}` : "—"}</Descriptions.Item>
              <Descriptions.Item label="Lead time">{product.leadTimeDays} days</Descriptions.Item>
              {product.upcStatus?.groupName && <Descriptions.Item label="UPC group">{product.upcStatus.groupName}</Descriptions.Item>}
              {details.map(([k, v]) => (
                <Descriptions.Item key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}>{String(v)}</Descriptions.Item>
              ))}
              <Descriptions.Item label="Description">{product.description || "—"}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        {!isDesigner && (
          <Col xs={24} lg={12}>
            <Card size="small" title="Stock by warehouse" style={{ marginBottom: 16 }}>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={warehouses}
                columns={[
                  { title: "Warehouse", dataIndex: "name" },
                  { title: "On hand", key: "onHand", align: "right", render: (_, w) => product.stockByWarehouse?.[w.id] ?? 0 },
                ]}
              />
            </Card>
          </Col>
        )}
      </Row>

      <ShadowSkusCard product={product} canEdit={!isDesigner} onChanged={load} />

      {!isDesigner && (
        <>
          <Card size="small" title={`Open orders (${page.openLines.length})`} style={{ marginBottom: 16 }}>
            <Table size="small" rowKey={(r) => `${r.orderId}-${r.shipDate}-${r.quantity}`} columns={orderColumns} dataSource={page.openLines} pagination={{ pageSize: 10 }} scroll={{ x: "max-content" }} />
          </Card>
          <Card size="small" title={`Incoming restocks (${page.restocks.length})`} style={{ marginBottom: 16 }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={page.restocks}
              columns={[
                {
                  title: "Container",
                  dataIndex: "containerNumber",
                  render: (n, r) => (r.containerId ? <Link to={`/restocks/${r.containerId}`}>{n || "Open"}</Link> : "—"),
                },
                { title: "Qty", dataIndex: "quantity", align: "right" },
                { title: "Expected", dataIndex: "expectedDate" },
                { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "—" },
                { title: "Supplier / PO", dataIndex: "supplier", render: (v) => v || "—" },
                { title: "Status", dataIndex: "status", render: (s) => <Tag>{s.replace(/_/g, " ")}</Tag> },
              ]}
            />
          </Card>
          <Card size="small" title="Recently shipped">
            <Table
              size="small"
              rowKey={(r) => `${r.orderId}-${r.shipDate}-${r.quantity}`}
              columns={[...orderColumns.slice(0, 4), { title: "Shipped", dataIndex: "shippedAt", render: (v, r) => v || r.shipDate }]}
              dataSource={page.shippedLines}
              pagination={{ pageSize: 10 }}
              scroll={{ x: "max-content" }}
            />
          </Card>
        </>
      )}

      {editing && <ProductWindow productId={product.id} onClose={() => setEditing(false)} onSaved={load} />}
      {showBarcode && <BarcodeModal upc={product.upc} sku={product.sku} label={product.name} onClose={() => setShowBarcode(false)} />}
    </>
  );
}

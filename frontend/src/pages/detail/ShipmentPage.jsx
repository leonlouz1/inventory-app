import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { Alert, Button, Card, Descriptions, Modal, Space, Spin, Table, Tag, Typography, message } from "antd";
import { ArrowLeftOutlined, FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import { ordersApi, shipmentsApi } from "../../api/inventory";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "../../constants/orderStatuses";
import { downloadShipmentPackingList, downloadShipmentPackingListPerOrder } from "../../utils/packingList";
import { showShadowMessages } from "../../utils/shadowMessages";
import BolModal from "../../components/BolModal";

const STATUS_COLORS = { SCHEDULED: "blue", PICKED_UP: "green", DELIVERED: "purple" };

// One shipment on its own page: /shipments/:id
export default function ShipmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);
  const [bolOpen, setBolOpen] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await shipmentsApi.get(id);
      const all = await ordersApi.list();
      const ids = new Set(s.orders.map((o) => o.id));
      setShipment(s);
      setOrders(all.filter((o) => ids.has(o.id)));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Put shadow-SKU lines on the SKU whose boxes ship, then build the slip
  async function packingList(perOrder) {
    try {
      const { changes, messages } = await ordersApi.assignShadows(orders.map((o) => o.id));
      showShadowMessages(messages);
      let current = orders;
      if (changes.length) {
        const ids = new Set(orders.map((o) => o.id));
        current = (await ordersApi.list()).filter((o) => ids.has(o.id));
        setOrders(current);
      }
      if (perOrder) await downloadShipmentPackingListPerOrder(shipment, current);
      else await downloadShipmentPackingList(shipment, current);
    } catch (err) {
      message.error(`Couldn't make packing list: ${err.message}`);
    }
  }

  function handlePackingList() {
    if (orders.length <= 1) {
      packingList(false);
      return;
    }
    setChoiceOpen(true);
  }

  if (error) return <Alert type="error" message="Couldn't load this shipment" description={error} showIcon />;
  if (!shipment) return <Spin />;

  const lines = orders.flatMap((o) => o.lines);
  const units = lines.reduce((s, l) => s + l.quantity, 0);
  const cases = lines.reduce((s, l) => s + (l.casePack ? l.quantity / l.casePack : 0), 0);

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }} onClick={() => navigate(-1)}>
        Back
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Space align="center">
          <Typography.Title level={4} style={{ margin: 0 }}>Shipment {shipment.shipmentNumber}</Typography.Title>
          <Tag color={STATUS_COLORS[shipment.status]}>{shipment.status.replace("_", " ")}</Tag>
        </Space>
        <Space wrap>
          <Button icon={<FileExcelOutlined />} disabled={!orders.length} onClick={handlePackingList}>Packing list</Button>
          <Button icon={<FilePdfOutlined />} disabled={!orders.length} onClick={() => setBolOpen(true)}>BOL</Button>
          <Button onClick={() => navigate("/shipments")}>Edit on Shipments</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="Pickup">{dayjs(shipment.pickupDate).format("MMM D, YYYY h:mm A")}</Descriptions.Item>
          <Descriptions.Item label="Carrier">{shipment.carrier || "—"}</Descriptions.Item>
          <Descriptions.Item label="CS / Pro #">{shipment.csNumber || "—"}</Descriptions.Item>
          <Descriptions.Item label="From warehouse">{shipment.warehouseName || "—"}</Descriptions.Item>
          <Descriptions.Item label="Totals">
            {orders.length} order{orders.length === 1 ? "" : "s"} · {units} units{cases ? ` · ${Math.round(cases * 10) / 10} cases` : ""}
          </Descriptions.Item>
          <Descriptions.Item label="Notes">{shipment.notes || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Typography.Title level={5}>Orders on this truck</Typography.Title>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={orders}
        scroll={{ x: "max-content" }}
        expandable={{
          expandedRowRender: (o) => (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={o.lines}
              columns={[
                { title: "SKU", dataIndex: "sku", render: (sku) => <Link to={`/products/${encodeURIComponent(sku)}`}>{sku}</Link> },
                { title: "Product", dataIndex: "productName" },
                { title: "Qty", dataIndex: "quantity", align: "right" },
                { title: "Warehouse", dataIndex: "warehouseName", render: (v) => v || "Unassigned" },
              ]}
            />
          ),
        }}
        columns={[
          { title: "Order #", dataIndex: "orderNumber", render: (n, o) => <Link to={`/orders/${o.id}`}>{n}</Link> },
          { title: "Customer", dataIndex: "customer", render: (c) => <Link to={`/customers?name=${encodeURIComponent(c)}`}>{c}</Link> },
          { title: "Customer PO #", dataIndex: "customerPo", render: (v) => v || "—" },
          { title: "Lines", key: "lines", align: "right", render: (_, o) => o.lines.length },
          { title: "Units", key: "units", align: "right", render: (_, o) => o.lines.reduce((s, l) => s + l.quantity, 0) },
          { title: "Status", dataIndex: "status", render: (s) => <Tag color={ORDER_STATUS_COLORS[s]}>{ORDER_STATUS_LABELS[s]}</Tag> },
        ]}
      />

      {bolOpen && <BolModal shipment={shipment} onClose={() => setBolOpen(false)} />}
      <Modal title="Packing list" open={choiceOpen} onCancel={() => setChoiceOpen(false)} footer={null} width={420}>
        <Typography.Paragraph type="secondary">
          This shipment has {orders.length} orders. How do you want the packing list?
        </Typography.Paragraph>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button block type="primary" icon={<FileExcelOutlined />} onClick={() => { setChoiceOpen(false); packingList(false); }}>
            One sheet with all orders
          </Button>
          <Button block icon={<FileExcelOutlined />} onClick={() => { setChoiceOpen(false); packingList(true); }}>
            One sheet per order
          </Button>
        </div>
      </Modal>
    </>
  );
}

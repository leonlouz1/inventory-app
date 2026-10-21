import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert, Button, Card, Checkbox, Col, Descriptions, Divider, Form, Input, InputNumber, Modal, Popconfirm, Row, Segmented,
  Select, Space, Spin, Statistic, Table, Tabs, Tooltip, Typography, Upload, message,
} from "antd";
import { DeleteOutlined, DownloadOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { costsApi } from "../api/inventory";
import { landedCost, margin, routePrice, sourcingCost, TARGET_MARGIN, usd } from "../utils/landedCost";
import MarginTag from "../components/MarginTag";


// Shared "ship to" controls: destination port and whether warehouse delivery is included
function ShipToControls({ rates, destinationId, setDestinationId, includeWarehouse, setIncludeWarehouse }) {
  return (
    <Space wrap>
      <span>Ship to</span>
      <Segmented
        value={destinationId}
        onChange={setDestinationId}
        options={rates.destinations.map((d) => ({ value: d.id, label: d.name }))}
      />
      <Tooltip title="Untick for FOB port orders: the customer picks up the container at the port, so no warehouse delivery">
        <Checkbox checked={includeWarehouse} onChange={(e) => setIncludeWarehouse(e.target.checked)}>
          Include warehouse delivery
        </Checkbox>
      </Tooltip>
    </Space>
  );
}

// Edit one product's cost for one origin, with a live breakdown
function SourcingModal({ product, origin, rates, destinationId, includeWarehouse, onClose, onSaved }) {
  const existing = product.sourcing.find((s) => s.originId === origin.id);
  const [form] = Form.useForm();
  const values = Form.useWatch([], form) || {};
  const [saving, setSaving] = useState(false);
  const destination = rates.destinations.find((d) => d.id === destinationId);
  const cost = landedCost({
    ...values,
    containerPrice: routePrice(rates, origin.id, destinationId),
    warehouseFee: includeWarehouse ? destination?.warehouseFee ?? 0 : 0,
  });

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await costsApi.setSourcing(product.id, origin.id, v);
      message.success(`${product.sku} · ${origin.name} cost saved`);
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await costsApi.deleteSourcing(product.id, origin.id);
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <Modal
      title={`${product.sku} · ${product.name} — made in ${origin.name}`}
      open
      onCancel={onClose}
      width={620}
      destroyOnHidden
      footer={[
        existing && (
          <Popconfirm key="del" title={`Remove the ${origin.name} cost?`} onConfirm={remove}>
            <Button danger style={{ float: "left" }}>Remove</Button>
          </Popconfirm>
        ),
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="save" type="primary" loading={saving} onClick={save}>Save</Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={existing || { dutyRate: 0, extraDutyRate: 0 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", columnGap: 12 }}>
          <Form.Item name="factoryPrice" label="Factory price (USD)" rules={[{ required: true, message: "Required" }]}>
            <InputNumber min={0} step={0.01} prefix="$" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="unitsPerContainer" label="Units per container" rules={[{ required: true, message: "Required" }]}>
            <InputNumber min={1} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="htsCode" label="HTS code"><Input placeholder="e.g. 9404.90.2000" /></Form.Item>
          <Form.Item name="dutyRate" label="Duty %"><InputNumber min={0} step={0.1} suffix="%" style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="extraDutyRate" label="Second layer %" tooltip="e.g. Section 301 tariff">
            <InputNumber min={0} step={0.1} suffix="%" style={{ width: "100%" }} />
          </Form.Item>
        </div>
      </Form>
      <Card size="small" style={{ background: "#fafafa" }}>
        <Typography.Text type="secondary">
          Shipping to {destination?.name} {includeWarehouse ? "with" : "without"} warehouse delivery
        </Typography.Text>
        <Descriptions size="small" column={2} style={{ marginTop: 8 }}>
          <Descriptions.Item label="Factory">{usd(cost.factory, 3)}</Descriptions.Item>
          <Descriptions.Item label="Duty">{usd(cost.duty, 3)}</Descriptions.Item>
          <Descriptions.Item label="Freight / unit">{usd(cost.freight, 3)}</Descriptions.Item>
          <Descriptions.Item label="Landed cost"><strong>{usd(cost.total, 3)}</strong></Descriptions.Item>
          <Descriptions.Item label="Wholesale">{usd(product.wholesalePrice)}</Descriptions.Item>
          <Descriptions.Item label="Margin"><MarginTag value={margin(product.wholesalePrice, cost.total)} /></Descriptions.Item>
        </Descriptions>
      </Card>
    </Modal>
  );
}

function ProductsTab({ rates, products, reload, destinationId, includeWarehouse }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(null);
  const [onlyCosted, setOnlyCosted] = useState(false);
  const [editing, setEditing] = useState(null); // { product, origin }

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const filtered = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (onlyCosted && !p.sourcing.length) return false;
    const term = search.trim().toLowerCase();
    return !term || [p.sku, p.name, p.brand].some((v) => v && v.toLowerCase().includes(term));
  });

  const columns = [
    {
      title: "SKU",
      dataIndex: "sku",
      fixed: "left",
      render: (sku) => <Link to={`/products/${encodeURIComponent(sku)}`}><strong>{sku}</strong></Link>,
      sorter: (a, b) => a.sku.localeCompare(b.sku),
    },
    { title: "Product", dataIndex: "name" },
    { title: "Category", dataIndex: "category", render: (v) => v || "—" },
    { title: "Wholesale", dataIndex: "wholesalePrice", align: "right", render: (v) => usd(v) },
    ...rates.origins.map((origin) => ({
      title: origin.name,
      key: `o-${origin.id}`,
      align: "right",
      render: (_, p) => {
        const s = p.sourcing.find((x) => x.originId === origin.id);
        if (!s) {
          return <Button size="small" type="link" icon={<PlusOutlined />} onClick={() => setEditing({ product: p, origin })}>Add</Button>;
        }
        const cost = sourcingCost(s, rates, destinationId, includeWarehouse);
        return (
          <Tooltip title={`Factory ${usd(cost.factory, 3)} + duty ${usd(cost.duty, 3)} + freight ${usd(cost.freight, 3)}`}>
            <Button size="small" type="text" onClick={() => setEditing({ product: p, origin })}>
              {usd(cost.total, 3)} <MarginTag value={margin(p.wholesalePrice, cost.total)} />
            </Button>
          </Tooltip>
        );
      },
    })),
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search placeholder="Search SKU, name, brand" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        <Select allowClear placeholder="All categories" style={{ width: 200 }} value={category} onChange={setCategory}
          options={categories.map((c) => ({ value: c, label: c }))} />
        <Checkbox checked={onlyCosted} onChange={(e) => setOnlyCosted(e.target.checked)}>Only products with costs</Checkbox>
        <CostSpreadsheet products={products} rates={rates} onImported={reload} />
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        Landed cost per unit for each origin, with margin against wholesale. Click a cell to enter or edit that origin&apos;s
        costs. Margins under {TARGET_MARGIN}% are red.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        scroll={{ x: "max-content" }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["50", "100", "200"] }}
      />
      {editing && (
        <SourcingModal
          {...editing}
          rates={rates}
          destinationId={destinationId}
          includeWarehouse={includeWarehouse}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}

// Download all costs as a spreadsheet, edit, upload. Rows with no factory price are skipped.
const SHEET_COLUMNS = [
  ["SKU", "sku"], ["Product", "name"], ["Origin", "origin"], ["Factory Price", "factoryPrice"], ["HTS Code", "htsCode"],
  ["Duty %", "dutyRate"], ["Second Duty %", "extraDutyRate"], ["Units per Container", "unitsPerContainer"],
];

function CostSpreadsheet({ products, rates, onImported }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const { default: ExcelJS } = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Costs", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    ws.columns = SHEET_COLUMNS.map(([header, key]) => ({ header, key, width: key === "name" ? 34 : 16 }));
    ws.getRow(1).font = { bold: true };
    for (const p of products) {
      if (p.sourcing.length) {
        for (const s of p.sourcing) ws.addRow({ ...s, sku: p.sku, name: p.name, origin: s.originName });
      } else {
        ws.addRow({ sku: p.sku, name: p.name });
      }
    }
    const originCol = SHEET_COLUMNS.findIndex(([, k]) => k === "origin") + 1;
    for (let r = 2; r <= ws.rowCount; r++) {
      ws.getCell(r, originCol).dataValidation = { type: "list", allowBlank: true, formulae: [`"${rates.origins.map((o) => o.name).join(",")}"`] };
    }
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `product_costs_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file) {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const cell = (v) => (v == null ? "" : typeof v === "object" ? String(v.result ?? v.text ?? "") : String(v).trim());
      const headers = ws.getRow(1).values.map(cell);
      const keyAt = new Map();
      headers.forEach((h, i) => {
        const col = SHEET_COLUMNS.find(([header]) => header.toLowerCase() === h.toLowerCase());
        if (col) keyAt.set(i, col[1]);
      });
      const rows = [];
      ws.eachRow((row, r) => {
        if (r === 1) return;
        const obj = {};
        row.eachCell({ includeEmpty: false }, (c, i) => { if (keyAt.has(i)) obj[keyAt.get(i)] = cell(c.value); });
        if (obj.sku && obj.origin && obj.factoryPrice) rows.push(obj);
      });
      if (!rows.length) {
        message.warning("No rows with a SKU, origin and factory price found");
        return false;
      }
      Modal.confirm({
        title: `Import ${rows.length} cost row${rows.length === 1 ? "" : "s"}?`,
        content: "Each row sets that SKU's cost for its origin (new origins are added). Rows without a factory price were skipped.",
        okText: "Import",
        onOk: async () => {
          try {
            const { imported } = await costsApi.import(rows);
            message.success(`Imported ${imported} cost row${imported === 1 ? "" : "s"}`);
            onImported();
          } catch (err) {
            message.error(err.message);
          }
        },
      });
    } catch (err) {
      message.error(`Couldn't read that file: ${err.message}`);
    } finally {
      setBusy(false);
    }
    return false;
  }

  return (
    <>
      <Button icon={<DownloadOutlined />} onClick={download}>Download costs</Button>
      <Upload accept=".xlsx" showUploadList={false} beforeUpload={upload}>
        <Button icon={<UploadOutlined />} loading={busy}>Upload costs</Button>
      </Upload>
    </>
  );
}

// What-if calculator: start from a product (optional) and change anything; nothing is saved
function CalculatorTab({ rates, products, destinationId, includeWarehouse }) {
  const [productId, setProductId] = useState(null);
  const [originId, setOriginId] = useState(rates.origins[0]?.id ?? null);
  const [typed, setTyped] = useState({}); // values typed over the defaults
  const [targetMargin, setTargetMargin] = useState(TARGET_MARGIN);
  const product = products.find((p) => p.id === productId);
  const destination = rates.destinations.find((d) => d.id === destinationId);
  const saved = product?.sourcing.find((x) => x.originId === originId);

  // Defaults come from the product's saved cost for the origin, its wholesale
  // price, the route's container price and the port's warehouse fee
  const defaults = {
    factoryPrice: saved?.factoryPrice ?? null,
    dutyRate: saved?.dutyRate ?? 0,
    extraDutyRate: saved?.extraDutyRate ?? 0,
    unitsPerContainer: saved?.unitsPerContainer ?? null,
    price: product?.wholesalePrice ?? null,
    containerPrice: routePrice(rates, originId, destinationId),
    warehouseFee: destination?.warehouseFee ?? 0,
  };
  const v = Object.fromEntries(Object.keys(defaults).map((k) => [k, typed[k] !== undefined ? typed[k] : defaults[k]]));

  const cost = landedCost({ ...v, warehouseFee: includeWarehouse ? v.warehouseFee : 0 });
  const m = margin(v.price, cost.total);
  const priceForTarget = targetMargin < 100 ? cost.total / (1 - targetMargin / 100) : null;
  const set = (key) => (val) => setTyped((prev) => ({ ...prev, [key]: val }));
  const num = (key, label, props = {}) => (
    <Form.Item label={label} style={{ marginBottom: 12 }}>
      <InputNumber value={v[key]} onChange={set(key)} min={0} style={{ width: "100%" }} {...props} />
    </Form.Item>
  );

  return (
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <Form layout="vertical">
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Form.Item label="Start from a product (optional)" style={{ marginBottom: 12 }}>
              <Select
                allowClear
                showSearch
                placeholder="Or type your own numbers below"
                value={productId}
                onChange={(id) => { setProductId(id); setTyped({}); }}
                options={products.map((p) => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
                filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item label="Made in" style={{ marginBottom: 12 }}>
              <Select value={originId} onChange={(id) => { setOriginId(id); setTyped({}); }} options={rates.origins.map((o) => ({ value: o.id, label: o.name }))} />
            </Form.Item>
          </div>
          {product && !product.sourcing.some((s) => s.originId === originId) && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`${product.sku} has no saved ${rates.origins.find((o) => o.id === originId)?.name} cost. Type it in below.`} />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {num("factoryPrice", "Factory price", { prefix: "$", step: 0.01 })}
            {num("dutyRate", "Duty %", { suffix: "%", step: 0.1 })}
            {num("extraDutyRate", "Second layer %", { suffix: "%", step: 0.1 })}
            {num("containerPrice", `Container (${rates.origins.find((o) => o.id === originId)?.name || ""} → ${destination?.name || ""})`, { prefix: "$" })}
            {num("warehouseFee", "Warehouse delivery", { prefix: "$", disabled: !includeWarehouse })}
            {num("unitsPerContainer", "Units per container", { precision: 0, min: 1 })}
            {num("price", "Selling price", { prefix: "$", step: 0.01 })}
          </div>
        </Form>
      </Col>
      <Col xs={24} lg={12}>
        <Card size="small" title="Per unit">
          <Descriptions size="small" column={1}>
            <Descriptions.Item label="Factory">{usd(cost.factory, 3)}</Descriptions.Item>
            <Descriptions.Item label="Duty">{usd(cost.duty, 3)}</Descriptions.Item>
            <Descriptions.Item label={`Freight${includeWarehouse ? " + warehouse delivery" : ""}`}>{usd(cost.freight, 3)}</Descriptions.Item>
          </Descriptions>
          <Divider style={{ margin: "8px 0" }} />
          <Row gutter={12}>
            <Col span={8}><Statistic title="Landed cost" value={cost.total} precision={3} prefix="$" /></Col>
            <Col span={8}><Statistic title="Profit / unit" value={v.price ? v.price - cost.total : 0} precision={3} prefix="$" /></Col>
            <Col span={8}>
              <Statistic
                title="Margin"
                value={m ?? 0}
                precision={1}
                suffix="%"
                valueStyle={{ color: m == null ? undefined : m < TARGET_MARGIN ? "#cf1322" : "#389e0d" }}
              />
            </Col>
          </Row>
          {v.unitsPerContainer > 0 && v.price > 0 && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              A full container ({v.unitsPerContainer} units) makes {usd((v.price - cost.total) * v.unitsPerContainer, 0)} profit.
            </Typography.Paragraph>
          )}
          <Divider style={{ margin: "12px 0" }} />
          <Space wrap>
            <span>Price for</span>
            <InputNumber value={targetMargin} onChange={(x) => setTargetMargin(x ?? 0)} min={0} max={99} suffix="%" style={{ width: 90 }} />
            <span>margin:</span>
            <strong>{usd(priceForTarget)}</strong>
          </Space>
        </Card>
      </Col>
    </Row>
  );
}

function RatesTab({ rates, reload }) {
  const [newOrigin, setNewOrigin] = useState("");
  const [newDestination, setNewDestination] = useState("");

  async function run(fn, done) {
    try {
      await fn();
      if (done) message.success(done);
      reload();
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <>
      <Typography.Title level={5}>Container price by route</Typography.Title>
      <Typography.Paragraph type="secondary">
        What one container costs from each origin to each port. Update it whenever freight changes, and every product
        recalculates.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={rates.origins}
        style={{ marginBottom: 24 }}
        columns={[
          {
            title: "Origin",
            dataIndex: "name",
            render: (name, o) => (
              <Space>
                <Typography.Text editable={{ onChange: (val) => val.trim() && val !== name && run(() => costsApi.renameOrigin(o.id, val)) }}>{name}</Typography.Text>
                <Popconfirm title={`Delete ${name}?`} onConfirm={() => run(() => costsApi.deleteOrigin(o.id))}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
          ...rates.destinations.map((d) => ({
            title: `→ ${d.name}`,
            key: `d-${d.id}`,
            render: (_, o) => {
              const route = rates.routes.find((r) => r.originId === o.id && r.destinationId === d.id);
              return (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <InputNumber
                    key={`${o.id}-${d.id}-${route?.updatedAt ?? "new"}`}
                    prefix="$"
                    min={0}
                    defaultValue={route?.containerPrice ?? 0}
                    style={{ width: 140 }}
                    onBlur={(e) => {
                      const val = Number(String(e.target.value).replace(/[^0-9.]/g, ""));
                      if (val !== (route?.containerPrice ?? 0)) run(() => costsApi.setRoute(o.id, d.id, val), `${o.name} → ${d.name} updated`);
                    }}
                  />
                  {route?.updatedAt && <span style={{ fontSize: 11, color: "#8c8c8c" }}>updated {route.updatedAt.slice(0, 10)}</span>}
                </div>
              );
            },
          })),
        ]}
      />
      <Space style={{ marginBottom: 24 }}>
        <Input placeholder="New origin, e.g. Vietnam" value={newOrigin} onChange={(e) => setNewOrigin(e.target.value)} style={{ width: 220 }} />
        <Button icon={<PlusOutlined />} disabled={!newOrigin.trim()} onClick={() => run(() => costsApi.addOrigin(newOrigin.trim()), "Origin added").then(() => setNewOrigin(""))}>
          Add origin
        </Button>
      </Space>

      <Typography.Title level={5}>Ports and warehouse delivery</Typography.Title>
      <Typography.Paragraph type="secondary">
        Flat rate per container to bring it from the port into the warehouse. Monthly storage isn&apos;t included.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={rates.destinations}
        style={{ marginBottom: 12 }}
        columns={[
          {
            title: "Port",
            dataIndex: "name",
            render: (name, d) => (
              <Typography.Text editable={{ onChange: (val) => val.trim() && val !== name && run(() => costsApi.updateDestination(d.id, { name: val })) }}>{name}</Typography.Text>
            ),
          },
          {
            title: "Warehouse delivery / container",
            dataIndex: "warehouseFee",
            render: (fee, d) => (
              <InputNumber
                key={`${d.id}-${fee}`}
                prefix="$"
                min={0}
                defaultValue={fee}
                style={{ width: 160 }}
                onBlur={(e) => {
                  const val = Number(String(e.target.value).replace(/[^0-9.]/g, ""));
                  if (val !== fee) run(() => costsApi.updateDestination(d.id, { warehouseFee: val }), `${d.name} updated`);
                }}
              />
            ),
          },
          {
            title: "",
            key: "del",
            width: 48,
            render: (_, d) => (
              <Popconfirm title={`Delete ${d.name}?`} onConfirm={() => run(() => costsApi.deleteDestination(d.id))}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Space>
        <Input placeholder="New port, e.g. Savannah" value={newDestination} onChange={(e) => setNewDestination(e.target.value)} style={{ width: 220 }} />
        <Button
          icon={<PlusOutlined />}
          disabled={!newDestination.trim()}
          onClick={() => run(() => costsApi.addDestination({ name: newDestination.trim() }), "Port added").then(() => setNewDestination(""))}
        >
          Add port
        </Button>
      </Space>
    </>
  );
}

// Landed cost and margins: per product and origin, a what-if calculator, and the rates behind them
export default function Costs() {
  const [rates, setRates] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("products");
  const [destinationId, setDestinationId] = useState(null);
  const [includeWarehouse, setIncludeWarehouse] = useState(true);

  const reload = useCallback(
    () => Promise.all([costsApi.rates(), costsApi.products()])
      .then(([r, p]) => {
        setRates(r);
        setProducts(p);
        setDestinationId((cur) => cur ?? r.destinations[0]?.id ?? null);
      })
      .catch((err) => setError(err.message)),
    []
  );

  useEffect(() => { reload(); }, [reload]);

  const costedCount = useMemo(() => (products || []).filter((p) => p.sourcing.length).length, [products]);

  if (error) return <Alert type="error" message="Couldn't load costs" description={error} showIcon />;
  if (!rates || !products) return <Spin />;

  const shared = { rates, products, destinationId, includeWarehouse };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <Typography.Title level={5} style={{ margin: 0 }}>Costs</Typography.Title>
          <Typography.Text type="secondary">{costedCount} of {products.length} products have costs entered</Typography.Text>
        </div>
        {tab !== "rates" && (
          <ShipToControls
            rates={rates}
            destinationId={destinationId}
            setDestinationId={setDestinationId}
            includeWarehouse={includeWarehouse}
            setIncludeWarehouse={setIncludeWarehouse}
          />
        )}
      </div>
      {rates.routes.every((r) => !r.containerPrice) && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Set your container prices on the Rates tab so freight is included in landed costs."
        />
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "products", label: "Products", children: <ProductsTab {...shared} reload={reload} /> },
          { key: "calculator", label: "Calculator", children: <CalculatorTab {...shared} /> },
          { key: "rates", label: "Rates", children: <RatesTab rates={rates} reload={reload} /> },
        ]}
      />
    </>
  );
}

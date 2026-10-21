import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Alert, Button, Card, Checkbox, Input, InputNumber, Popconfirm, Segmented, Select, Space, Spin, Table, Tag, Tooltip, Typography,
  Upload, message,
} from "antd";
import {
  ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, DeleteOutlined, FileExcelOutlined, PictureOutlined, PlusOutlined, SaveOutlined,
} from "@ant-design/icons";
import { costsApi, linesheetsApi, productsApi } from "../../api/inventory";
import { margin, sourcingCost, usd, TARGET_MARGIN } from "../../utils/landedCost";
import { exportLinesheet } from "../../utils/linesheetExport";
import { uploadProductImage } from "../../utils/imageUpload";
import MarginTag from "../../components/MarginTag";

// Edit one linesheet: blocks of products (one image and QTY per block), the
// price for each SKU, and — for you only — landed cost and margin per line.
export default function LinesheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState(null);
  const [rates, setRates] = useState(null);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [adding, setAdding] = useState([]);

  const load = useCallback(async () => {
    try {
      const [s, p, r] = await Promise.all([linesheetsApi.get(id), costsApi.products(), costsApi.rates()]);
      setSheet(s);
      setItems(s.items.map((i) => ({ ...i, key: `${i.productId}-${i.id}` })));
      setProducts(p);
      setRates(r);
      setDirty(false);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const productById = useMemo(() => new Map((products || []).map((p) => [p.id, p])), [products]);

  const change = (fn) => { setItems(fn); setDirty(true); };
  const setHeader = (patch) => { setSheet((s) => ({ ...s, ...patch })); setDirty(true); };

  // Cost of a line: its chosen origin, or the most expensive origin to be safe
  function lineCost(item) {
    const p = productById.get(item.productId);
    if (!p?.sourcing.length || !sheet?.destinationId) return null;
    const options = item.originId ? p.sourcing.filter((s) => s.originId === item.originId) : p.sourcing;
    const costs = options.map((s) => ({ s, cost: sourcingCost(s, rates, sheet.destinationId, sheet.includeWarehouse).total }));
    if (!costs.length) return null;
    return costs.reduce((a, b) => (b.cost > a.cost ? b : a));
  }

  const blocks = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.block)) map.set(item.block, []);
      map.get(item.block).push(item);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([block, list]) => ({ block, items: list }));
  }, [items]);

  // Add options: whole UPC groups first, then single products
  const addOptions = useMemo(() => {
    if (!products) return [];
    const groups = new Map();
    for (const p of products) {
      if (!p.upcGroup) continue;
      if (!groups.has(p.upcGroup.id)) groups.set(p.upcGroup.id, { name: p.upcGroup.name, ids: [] });
      groups.get(p.upcGroup.id).ids.push(p.id);
    }
    return [
      {
        label: "UPC groups (one block)",
        options: [...groups.entries()].map(([gid, g]) => ({ value: `g:${gid}`, label: `${g.name} (${g.ids.length})`, ids: g.ids })),
      },
      { label: "Products", options: products.map((p) => ({ value: `p:${p.id}`, label: `${p.sku} — ${p.name}`, ids: [p.id] })) },
    ];
  }, [products]);

  function addSelected() {
    const all = addOptions.flatMap((g) => g.options);
    const ids = [...new Set(adding.flatMap((v) => all.find((o) => o.value === v)?.ids || []))];
    if (!ids.length) return;
    const nextBlock = items.length ? Math.max(...items.map((i) => i.block)) + 1 : 0;
    change((prev) => [
      ...prev,
      ...ids.map((pid) => ({
        key: `${pid}-new-${Math.random().toString(36).slice(2)}`,
        productId: pid,
        block: nextBlock,
        price: productById.get(pid)?.wholesalePrice ?? null,
        qty: null,
        originId: null,
      })),
    ]);
    setAdding([]);
  }

  const updateItem = (key, patch) => change((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const updateBlock = (block, patch) => change((prev) => prev.map((i) => (i.block === block ? { ...i, ...patch } : i)));
  const removeBlock = (block) => change((prev) => prev.filter((i) => i.block !== block));
  function moveBlock(block, dir) {
    const order = blocks.map((b) => b.block);
    const idx = order.indexOf(block);
    const swapWith = order[idx + dir];
    if (swapWith === undefined) return;
    change((prev) => prev.map((i) => (i.block === block ? { ...i, block: swapWith } : i.block === swapWith ? { ...i, block } : i)));
  }

  async function save() {
    setSaving(true);
    try {
      await linesheetsApi.save(id, {
        name: sheet.name,
        customer: sheet.customer,
        destinationId: sheet.destinationId,
        includeWarehouse: sheet.includeWarehouse,
        items: blocks.flatMap((b, bi) => b.items.map((i) => ({ ...i, block: bi }))),
      });
      message.success("Linesheet saved");
      setDirty(false);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Upload a photo for a block: it becomes the image of the block's products that don't have one
  async function uploadBlockImage(block, file) {
    const list = blocks.find((b) => b.block === block).items;
    try {
      const first = list[0].productId;
      const { url } = await uploadProductImage(file, first);
      const others = list.map((i) => i.productId).filter((pid) => pid !== first && !productById.get(pid)?.imageUrl);
      await Promise.all(others.map((pid) => productsApi.update(pid, { imageUrl: url })));
      setProducts((prev) => prev.map((p) => (p.id === first || others.includes(p.id) ? { ...p, imageUrl: url } : p)));
      message.success("Image saved to the product");
    } catch (err) {
      message.error(`Couldn't upload: ${err.message}`);
    }
    return false;
  }

  async function doExport() {
    setExporting(true);
    try {
      const missing = await exportLinesheet(sheet.name, blocks.map((b) => ({
        imageUrl: b.items.map((i) => productById.get(i.productId)?.imageUrl).find(Boolean) || null,
        items: b.items.map((i) => {
          const p = productById.get(i.productId);
          return { sku: p?.sku, upc: p?.upc, color: p?.color, ct: p?.packSize, price: i.price, qty: i.qty };
        }),
      })));
      if (missing) message.warning(`${missing} image${missing === 1 ? "" : "s"} couldn't be loaded and were left out`);
    } catch (err) {
      message.error(`Couldn't export: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  if (error) return <Alert type="error" message="Couldn't load this linesheet" description={error} showIcon />;
  if (!sheet || !products || !rates) return <Spin />;

  const lineMargins = items.map((i) => margin(i.price, lineCost(i)?.cost));
  const lowCount = lineMargins.filter((m) => m != null && m < TARGET_MARGIN).length;
  const noCostCount = items.filter((i) => !lineCost(i)).length;

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0, marginBottom: 8 }} onClick={() => navigate("/linesheets")}>
        Linesheets
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Space wrap align="center">
          <Input
            value={sheet.name}
            onChange={(e) => setHeader({ name: e.target.value })}
            style={{ fontSize: 18, fontWeight: 600, width: 320 }}
          />
          <Input placeholder="Customer" value={sheet.customer || ""} onChange={(e) => setHeader({ customer: e.target.value })} style={{ width: 200 }} />
        </Space>
        <Space wrap>
          {dirty && <Tag color="orange">Unsaved changes</Tag>}
          <Button icon={<SaveOutlined />} type={dirty ? "primary" : "default"} loading={saving} onClick={save}>Save</Button>
          <Button icon={<FileExcelOutlined />} loading={exporting} disabled={!items.length} onClick={doExport}>Export Excel</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size="large">
          <Space>
            <span>Costs for</span>
            <Segmented
              value={sheet.destinationId}
              onChange={(v) => setHeader({ destinationId: v })}
              options={rates.destinations.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Tooltip title="Untick for FOB port orders: the customer picks up the container at the port">
              <Checkbox checked={sheet.includeWarehouse} onChange={(e) => setHeader({ includeWarehouse: e.target.checked })}>
                Include warehouse delivery
              </Checkbox>
            </Tooltip>
          </Space>
          <span>
            {items.length} SKU{items.length === 1 ? "" : "s"} in {blocks.length} block{blocks.length === 1 ? "" : "s"}
            {lowCount > 0 && <Tag color="red" style={{ marginLeft: 8 }}>{lowCount} under {TARGET_MARGIN}%</Tag>}
            {noCostCount > 0 && <Tag style={{ marginLeft: 8 }}>{noCostCount} without costs</Tag>}
          </span>
        </Space>
        <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>
          Cost and margin are only shown to you. The exported Excel has Image, SKU, UPC, Color, CT, Price and QTY.
        </Typography.Paragraph>
      </Card>

      <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
        <Select
          mode="multiple"
          showSearch
          placeholder="Add a UPC group or products (each add becomes one block)"
          value={adding}
          onChange={setAdding}
          options={addOptions}
          style={{ width: "100%" }}
          filterOption={(input, opt) => (opt.label || "").toString().toLowerCase().includes(input.toLowerCase())}
          maxTagCount="responsive"
        />
        <Button type="primary" icon={<PlusOutlined />} disabled={!adding.length} onClick={addSelected}>Add</Button>
      </Space.Compact>

      {blocks.length === 0 && <Card><Typography.Text type="secondary">Add products above to start this linesheet.</Typography.Text></Card>}

      {blocks.map((b, bi) => {
        const firstProduct = productById.get(b.items[0].productId);
        const imageUrl = b.items.map((i) => productById.get(i.productId)?.imageUrl).find(Boolean);
        const blockQty = b.items[0].qty;
        const units = lineCost(b.items[0])?.s.unitsPerContainer;
        return (
          <Card
            key={b.block}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <Space wrap>
                <span>{firstProduct?.upcGroup?.name || firstProduct?.name || "Block"}</span>
                <Typography.Text type="secondary" style={{ fontWeight: 400 }}>{b.items.length} SKU{b.items.length === 1 ? "" : "s"}</Typography.Text>
              </Space>
            }
            extra={
              <Space>
                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={bi === 0} onClick={() => moveBlock(b.block, -1)} />
                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={bi === blocks.length - 1} onClick={() => moveBlock(b.block, 1)} />
                <Popconfirm title="Remove this block?" onConfirm={() => removeBlock(b.block)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ width: 140, textAlign: "center" }}>
                {imageUrl
                  ? <img src={imageUrl} alt="" style={{ width: 130, height: 130, objectFit: "contain", border: "1px solid #f0f0f0", borderRadius: 6 }} />
                  : <div style={{ width: 130, height: 130, background: "#f5f5f5", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>No image</div>}
                <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => uploadBlockImage(b.block, file)}>
                  <Button size="small" icon={<PictureOutlined />} style={{ marginTop: 6 }}>{imageUrl ? "Change" : "Upload"}</Button>
                </Upload>
                <div style={{ marginTop: 10, textAlign: "left" }}>
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>QTY (whole block)</div>
                  <InputNumber min={0} precision={0} value={blockQty} onChange={(v) => updateBlock(b.block, { qty: v })} style={{ width: 130 }} />
                  {units && (
                    <Button size="small" type="link" style={{ padding: 0 }} onClick={() => updateBlock(b.block, { qty: units })}>
                      Fill units/container ({units})
                    </Button>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 520 }}>
                <Table
                  size="small"
                  rowKey="key"
                  pagination={false}
                  dataSource={b.items}
                  scroll={{ x: "max-content" }}
                  columns={[
                    {
                      title: "SKU",
                      key: "sku",
                      render: (_, i) => {
                        const p = productById.get(i.productId);
                        return p ? <Link to={`/products/${encodeURIComponent(p.sku)}`}><strong>{p.sku}</strong></Link> : "?";
                      },
                    },
                    { title: "Color", key: "color", render: (_, i) => productById.get(i.productId)?.color || "—" },
                    { title: "CT", key: "ct", render: (_, i) => productById.get(i.productId)?.packSize ?? "—" },
                    { title: "UPC", key: "upc", render: (_, i) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{productById.get(i.productId)?.upc || "—"}</span> },
                    {
                      title: "Price",
                      key: "price",
                      render: (_, i) => (
                        <InputNumber prefix="$" min={0} step={0.05} precision={2} value={i.price} onChange={(v) => updateItem(i.key, { price: v })} style={{ width: 110 }} />
                      ),
                    },
                    {
                      title: "Cost basis",
                      key: "origin",
                      render: (_, i) => {
                        const p = productById.get(i.productId);
                        if (!p?.sourcing.length) return <Link to="/costs" style={{ fontSize: 12 }}>Add costs</Link>;
                        return (
                          <Select
                            size="small"
                            value={i.originId ?? "max"}
                            style={{ width: 130 }}
                            onChange={(v) => updateItem(i.key, { originId: v === "max" ? null : v })}
                            options={[
                              ...(p.sourcing.length > 1 ? [{ value: "max", label: "Highest cost" }] : [{ value: "max", label: p.sourcing[0].originName }]),
                              ...(p.sourcing.length > 1 ? p.sourcing.map((s) => ({ value: s.originId, label: s.originName })) : []),
                            ]}
                          />
                        );
                      },
                    },
                    { title: "Landed", key: "cost", align: "right", render: (_, i) => usd(lineCost(i)?.cost, 3) },
                    { title: "Margin", key: "margin", render: (_, i) => <MarginTag value={margin(i.price, lineCost(i)?.cost)} /> },
                    {
                      title: "",
                      key: "del",
                      render: (_, i) => (
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => change((prev) => prev.filter((x) => x.key !== i.key))} />
                      ),
                    },
                  ]}
                />
                <Space style={{ marginTop: 8 }} wrap>
                  <span style={{ color: "#8c8c8c", fontSize: 12 }}>Set price for the whole block</span>
                  <InputNumber
                    size="small"
                    prefix="$"
                    min={0}
                    step={0.05}
                    precision={2}
                    placeholder="Price"
                    onPressEnter={(e) => {
                      const v = Number(String(e.target.value).replace(/[^0-9.]/g, ""));
                      if (v) updateBlock(b.block, { price: v });
                    }}
                    onBlur={(e) => {
                      const v = Number(String(e.target.value).replace(/[^0-9.]/g, ""));
                      if (v) updateBlock(b.block, { price: v });
                    }}
                    style={{ width: 120 }}
                  />
                </Space>
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Popconfirm, Select, Space, Tag, Typography, message } from "antd";
import { DisconnectOutlined, PlusOutlined } from "@ant-design/icons";
import { productsApi } from "../api/inventory";

const skuLink = (sku) => <Link to={`/products/${encodeURIComponent(sku)}`}>{sku}</Link>;

// Shadow SKUs on a product page. A new SKU lists the old SKUs that moved to it
// (its shadows); an old SKU shows the new SKU it moved to (its shadow parent).
// Each keeps its own stock; orders on an old SKU use its stock first.
export default function ShadowSkusCard({ product, canEdit, onChanged }) {
  const [products, setProducts] = useState(null);
  const [picking, setPicking] = useState(null); // "shadow" | "parent"
  const [choice, setChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const shadows = product.shadows || [];
  const parent = product.shadowParent;

  useEffect(() => {
    if (picking && !products) productsApi.list().then(setProducts).catch((err) => message.error(err.message));
  }, [picking, products]);

  async function save(fn, done) {
    setSaving(true);
    try {
      await fn();
      message.success(done);
      setProducts(null); // reload the choices next time, links just changed
      setPicking(null);
      setChoice(null);
      onChanged();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const label = (p) => `${p.sku} — ${p.name}`;
  const others = (products || []).filter((p) => p.id !== product.id);
  // Old SKUs that can become this one's shadows: not already shadows elsewhere, no shadows of their own
  const shadowOptions = others
    .filter((p) => !p.shadowParentId && !p.shadows?.length && !shadows.some((s) => s.id === p.id))
    .map((p) => ({ value: p.id, label: label(p) }));
  // New SKUs this one can move to: not shadows themselves
  const parentOptions = others.filter((p) => !p.shadowParentId).map((p) => ({ value: p.id, label: label(p) }));

  const picker = (options, placeholder, onSave) => (
    <Space wrap style={{ marginTop: 8 }}>
      <Select
        showSearch
        loading={!products}
        placeholder={placeholder}
        style={{ width: 320 }}
        value={choice}
        onChange={setChoice}
        options={options}
        filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
      />
      <Button type="primary" disabled={!choice} loading={saving} onClick={onSave}>Link</Button>
      <Button onClick={() => { setPicking(null); setChoice(null); }}>Cancel</Button>
    </Space>
  );

  let body;
  if (parent) {
    body = (
      <>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          This is an old SKU that moved to <Tag color="purple">{skuLink(parent.sku)}</Tag>. Orders for {product.sku} use its own
          stock first, then {parent.sku}&apos;s.
        </Typography.Paragraph>
        {canEdit && (
          <Popconfirm
            title={`Unlink ${product.sku} from ${parent.sku}?`}
            okText="Unlink"
            onConfirm={() => save(() => productsApi.setShadowParent(product.id, null), "Unlinked")}
          >
            <Button size="small" icon={<DisconnectOutlined />}>Unlink</Button>
          </Popconfirm>
        )}
      </>
    );
  } else {
    body = (
      <>
        {shadows.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {shadows.map((s) => (
              <Tag key={s.id} color="geekblue" style={{ padding: "2px 8px" }}>
                old SKU {skuLink(s.sku)}
                {canEdit && (
                  <Popconfirm
                    title={`Unlink ${s.sku}?`}
                    okText="Unlink"
                    onConfirm={() => save(
                      () => productsApi.setShadows(product.id, shadows.filter((x) => x.id !== s.id).map((x) => x.id)),
                      `${s.sku} unlinked`
                    )}
                  >
                    <DisconnectOutlined style={{ marginLeft: 6, cursor: "pointer" }} />
                  </Popconfirm>
                )}
              </Tag>
            ))}
          </div>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            No old SKUs are linked to {product.sku}.
            {canEdit && " If this SKU replaces an old one, add it here, or set this SKU's own new SKU below."}
          </Typography.Paragraph>
        )}
        {canEdit && !picking && (
          <Space wrap>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setPicking("shadow")}>Add old SKU (shadow)</Button>
            {shadows.length === 0 && (
              <Button size="small" onClick={() => setPicking("parent")}>This is an old SKU: set its new SKU</Button>
            )}
          </Space>
        )}
        {picking === "shadow" && picker(shadowOptions, "Old SKU that moved to this one", () => save(
          () => productsApi.setShadows(product.id, [...shadows.map((s) => s.id), choice]),
          "Old SKU linked"
        ))}
        {picking === "parent" && picker(parentOptions, "New SKU this one moved to", () => save(
          () => productsApi.setShadowParent(product.id, choice),
          "Linked to its new SKU"
        ))}
      </>
    );
  }

  return (
    <Card size="small" title="Shadow SKUs" style={{ marginBottom: 16 }}>
      {body}
    </Card>
  );
}

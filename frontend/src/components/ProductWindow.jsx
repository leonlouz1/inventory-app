import { useEffect, useState } from "react";
import {
  Modal, Tabs, Form, Input, InputNumber, Select, Row, Col, Typography, Image, Button, Tag, Spin, Alert, Upload, message,
} from "antd";
import { BarcodeOutlined } from "@ant-design/icons";
import { productsApi, warehousesApi } from "../api/inventory";
import { PRODUCT_CATEGORIES, DEFAULT_CASE_PACK } from "../constants/categories";
import { PRODUCT_BRANDS } from "../constants/brands";
import { useRole } from "../hooks/useRole";
import CategoryFields from "./CategoryFields";
import BarcodeModal from "./BarcodeModal";
import { uploadProductImage } from "../utils/imageUpload";

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }));
const BRAND_OPTIONS = PRODUCT_BRANDS.map((b) => ({ value: b, label: b }));

// Shadow SKUs: an old SKU (shadow) that moved to a new SKU (shadow parent). It
// keeps its own stock, and orders on it use that stock first, then the parent's.
function ShadowFields({ product, products, form }) {
  const parentId = Form.useWatch("shadowParentId", form);
  const shadowIds = Form.useWatch("shadowIds", form) || [];
  const others = products.filter((p) => p.id !== product.id);
  const label = (p) => `${p.sku} — ${p.name}`;
  return (
    <Row gutter={12}>
      <Col span={12}>
        <Form.Item
          name="shadowParentId"
          label="Shadow parent"
          tooltip="Set this on an old SKU: the new SKU it moved to. Orders on this SKU use its own stock first, then the parent's."
        >
          <Select
            allowClear
            showSearch
            disabled={shadowIds.length > 0}
            placeholder={shadowIds.length ? "Has shadows of its own" : "None"}
            options={others.filter((p) => !p.shadowParentId).map((p) => ({ value: p.id, label: label(p) }))}
            filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
      </Col>
      <Col span={12}>
        <Form.Item name="shadowIds" label="Shadows" tooltip="Set this on a new SKU: the old SKUs that moved to it.">
          <Select
            mode="multiple"
            allowClear
            showSearch
            disabled={!!parentId}
            placeholder={parentId ? "This SKU is a shadow" : "None"}
            options={others
              .filter((p) => !p.shadows?.length && (!p.shadowParentId || p.shadowParentId === product.id))
              .map((p) => ({ value: p.id, label: label(p) }))}
            filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
      </Col>
    </Row>
  );
}

// One window for a product, opened from Products, Catalog or UPC Codes. Every
// tab edits the same product record, so a change made here shows everywhere.
// Designers get every tab except Stock, and can't change shadow links.
export default function ProductWindow({ productId, initialTab = "details", onClose, onSaved }) {
  const { isDesigner } = useRole();
  const [form] = Form.useForm();
  const [product, setProduct] = useState(null);
  const [initialValues, setInitialValues] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [showBarcode, setShowBarcode] = useState(false);
  const category = Form.useWatch("category", form);
  const imageUrl = Form.useWatch("imageUrl", form);

  useEffect(() => {
    let active = true;
    Promise.all([
      productsApi.full(productId),
      isDesigner ? Promise.resolve([]) : warehousesApi.list(),
      isDesigner ? Promise.resolve([]) : productsApi.list(),
    ])
      .then(([p, w, all]) => {
        if (!active) return;
        setProduct(p);
        setWarehouses(w);
        setProducts(all);
        setInitialValues({
          name: p.name,
          brand: p.brand,
          category: p.category,
          leadTimeDays: p.leadTimeDays,
          casePack: p.casePack ?? undefined,
          attributes: { ...p.attributes, color: p.attributes?.color ?? p.color ?? undefined },
          imageUrl: p.imageUrl,
          description: p.description,
          wholesalePrice: p.wholesalePrice,
          retailPrice: p.retailPrice,
          upc: p.upc,
          shadowParentId: p.shadowParent?.id,
          shadowIds: (p.shadows || []).map((s) => s.id),
          ...Object.fromEntries(w.map((wh) => [`stock_${wh.id}`, p.stockByWarehouse?.[wh.id] ?? 0])),
        });
      })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [productId, isDesigner]);

  function handleValuesChange(changed) {
    const preset = DEFAULT_CASE_PACK[changed.category];
    if ("category" in changed && preset && !form.getFieldValue("casePack")) form.setFieldsValue({ casePack: preset });
  }

  async function handleSave() {
    let values;
    try {
      values = await form.validateFields();
    } catch (err) {
      const first = err.errorFields?.[0]?.name?.[0];
      if (["imageUrl", "description", "wholesalePrice", "retailPrice", "upc"].includes(first)) setTab("catalog");
      else if (first) setTab("details");
      message.warning("Some required fields are missing");
      return;
    }
    const { shadowParentId, shadowIds, ...rest } = values;
    const fields = {};
    for (const [k, v] of Object.entries(rest)) if (!k.startsWith("stock_")) fields[k] = v;
    if (product.upcLocked) delete fields.upc;

    setSaving(true);
    try {
      await productsApi.update(product.id, fields);
      if (!isDesigner) {
        if (warehouses.length) {
          await productsApi.updateStock(product.id, warehouses.map((w) => ({ warehouseId: w.id, onHand: values[`stock_${w.id}`] ?? 0 })));
        }
        if ((shadowParentId ?? null) !== (product.shadowParent?.id ?? null)) {
          await productsApi.setShadowParent(product.id, shadowParentId ?? null);
        }
        const oldIds = (product.shadows || []).map((s) => s.id).sort().join();
        if ((shadowIds || []).slice().sort().join() !== oldIds) await productsApi.setShadows(product.id, shadowIds || []);
      }
      message.success(`${product.sku} saved`);
      onSaved?.();
      onClose();
    } catch (err) {
      message.error(`Couldn't save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const tabs = product && [
    {
      key: "details",
      label: "Details",
      forceRender: true,
      children: (
        <>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="brand" label="Brand">
                <Select allowClear placeholder="Select brand" options={BRAND_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select allowClear placeholder="Select category" options={CATEGORY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="casePack" label="Case Pack" tooltip="Units per case" rules={[{ required: true, message: "Required" }]}>
                <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="e.g. 24" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="leadTimeDays" label="Lead Time (days)">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <CategoryFields category={category} />
        </>
      ),
    },
    {
      key: "catalog",
      label: "Catalog",
      forceRender: true,
      children: (
        <>
          <Form.Item label="Image" style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Form.Item name="imageUrl" noStyle>
                <Input placeholder="Paste an image link, or upload" />
              </Form.Item>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    const { url } = await uploadProductImage(file, product.id);
                    form.setFieldsValue({ imageUrl: url });
                    message.success("Image uploaded");
                  } catch (err) {
                    message.error(`Couldn't upload: ${err.message}`);
                  }
                  return false;
                }}
              >
                <Button>Upload</Button>
              </Upload>
            </div>
          </Form.Item>
          {imageUrl && (
            <div style={{ marginBottom: 12 }}>
              <Image src={imageUrl} height={140} style={{ objectFit: "contain" }} />
            </div>
          )}
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="wholesalePrice" label="Wholesale Price">
                <InputNumber prefix="$" precision={2} min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="retailPrice" label="Retail Price">
                <InputNumber prefix="$" precision={2} min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="upc"
            label="UPC"
            extra={product.upcLocked ? "Set by the UPC system for this SKU" : undefined}
          >
            <Input disabled={product.upcLocked} style={{ fontFamily: "monospace" }} />
          </Form.Item>
        </>
      ),
    },
    {
      key: "upc",
      label: "UPC",
      forceRender: true,
      children: (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "monospace", fontSize: 18 }}>{product.upc || "No UPC"}</span>
            {product.upc && /^\d{12}$/.test(product.upc) && (
              <Button icon={<BarcodeOutlined />} onClick={() => setShowBarcode(true)}>Barcode artwork</Button>
            )}
          </div>
          <Typography.Paragraph type="secondary">
            {product.upcStatus
              ? <>On the UPC Codes page{product.upcStatus.groupName ? <> in group <Tag>{product.upcStatus.groupName}</Tag></> : ""}
                {product.upcStatus.inUse ? "" : " (not marked in use)"}.</>
              : product.upcLocked ? "A Travel number from the UPC system." : "This SKU isn't on the UPC Codes page."}
          </Typography.Paragraph>
          <Typography.Title level={5}>Shadow SKUs</Typography.Title>
          {isDesigner ? (
            <Typography.Paragraph>
              {product.shadowParent ? <>Shadow of <Tag color="purple">{product.shadowParent.sku}</Tag></> : null}
              {product.shadows?.length ? <>Shadows: {product.shadows.map((s) => <Tag key={s.id}>{s.sku}</Tag>)}</> : null}
              {!product.shadowParent && !product.shadows?.length && <Typography.Text type="secondary">None</Typography.Text>}
            </Typography.Paragraph>
          ) : (
            <ShadowFields product={product} products={products} form={form} />
          )}
        </>
      ),
    },
    ...(isDesigner ? [] : [{
      key: "stock",
      label: "Stock",
      forceRender: true,
      children: (
        <Row gutter={12}>
          {warehouses.map((w) => (
            <Col span={8} key={w.id}>
              <Form.Item name={`stock_${w.id}`} label={`${w.name} on hand`}>
                <InputNumber min={0} precision={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          ))}
        </Row>
      ),
    }]),
  ];

  return (
    <Modal
      title={product ? `${product.sku} — ${product.name}` : "Product"}
      open
      onCancel={onClose}
      onOk={handleSave}
      okText="Save"
      okButtonProps={{ disabled: !product }}
      confirmLoading={saving}
      width={720}
      destroyOnHidden
    >
      {error && <Alert type="error" message={error} showIcon />}
      {!product && !error && <Spin />}
      {product && (
        <Form form={form} layout="vertical" initialValues={initialValues} onValuesChange={handleValuesChange}>
          <Tabs activeKey={tab} onChange={setTab} items={tabs} />
        </Form>
      )}
      {showBarcode && (
        <BarcodeModal upc={product.upc} sku={product.sku} label={product.name} onClose={() => setShowBarcode(false)} />
      )}
    </Modal>
  );
}

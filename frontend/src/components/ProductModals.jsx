import { useEffect } from "react";
import { Modal, Form, Input, InputNumber, Select, Row, Col, Typography, message } from "antd";
import { productsApi } from "../api/inventory";
import CategoryFields from "./CategoryFields";
import { PRODUCT_CATEGORIES, DEFAULT_CASE_PACK } from "../constants/categories";
import { PRODUCT_BRANDS } from "../constants/brands";

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }));
const BRAND_OPTIONS = PRODUCT_BRANDS.map((b) => ({ value: b, label: b }));

// Picking a category with a standard case pack (Neck Pillows = 24) fills it in
// when the field is still empty.
function prefillCasePack(form) {
  return (changed) => {
    const preset = DEFAULT_CASE_PACK[changed.category];
    if ("category" in changed && preset && !form.getFieldValue("casePack")) form.setFieldsValue({ casePack: preset });
  };
}

const CASE_PACK_ITEM = (
  <Form.Item
    name="casePack"
    label="Case Pack"
    tooltip="Units per case, used to calculate cases on orders and packing lists"
    rules={[{ required: true, message: "Required" }]}
    style={{ maxWidth: 180 }}
  >
    <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="e.g. 24" />
  </Form.Item>
);

export function NewProductModal({ open, onClose, onCreated, warehouses }) {
  const [form] = Form.useForm();
  const category = Form.useWatch("category", form);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      const initialStock = warehouses.map((w) => ({
        warehouseId: w.id,
        onHand: values[`stock_${w.id}`] ?? 0,
      }));
      await productsApi.create({
        sku: values.sku,
        name: values.name,
        brand: values.brand,
        category: values.category,
        leadTimeDays: values.leadTimeDays ?? 45,
        casePack: values.casePack,
        attributes: values.attributes,
        initialStock,
      });
      message.success(`Product ${values.sku} created`);
      form.resetFields();
      onClose();
      onCreated();
    } catch (err) {
      if (err.errorFields) return; // form validation error, already shown inline
      message.error(`Failed to create product: ${err.message}`);
    }
  }

  return (
    <Modal
      title="Add Product"
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={handleOk}
      okText="Create"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ leadTimeDays: 45 }} onValuesChange={prefillCasePack(form)}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="sku" label="SKU" rules={[{ required: true, message: "Required" }]}>
              <Input placeholder="WDG-001" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
              <Input placeholder="Widget" />
            </Form.Item>
          </Col>
        </Row>
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
            <Form.Item name="leadTimeDays" label="Lead Time (days)">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>{CASE_PACK_ITEM}</Col>
        </Row>
        <CategoryFields category={category} />

        {warehouses.length > 0 && <Typography.Title level={5}>Initial On-Hand</Typography.Title>}
        <Row gutter={12}>
          {warehouses.map((w) => (
            <Col span={6} key={w.id}>
              <Form.Item name={`stock_${w.id}`} label={w.name} initialValue={0}>
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          ))}
        </Row>
      </Form>
    </Modal>
  );
}

// Shadow SKUs: an old SKU (shadow) that moved to a new SKU (shadow parent). It
// keeps its own stock, and orders on it use that stock first, then the parent's.
function ShadowFields({ product, products, form }) {
  const parentId = Form.useWatch("shadowParentId", form);
  const shadowIds = Form.useWatch("shadowIds", form) || [];
  const others = products.filter((p) => p.id !== product.id);
  const label = (p) => `${p.sku} — ${p.name}`;
  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 8 }}>Shadow SKUs</Typography.Title>
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
          <Form.Item
            name="shadowIds"
            label="Shadows"
            tooltip="Set this on a new SKU: the old SKUs that moved to it."
          >
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
    </>
  );
}

export function EditProductModal({ open, onClose, onUpdated, product, warehouses, products = [], showShadows = false }) {
  const [form] = Form.useForm();
  const category = Form.useWatch("category", form);

  useEffect(() => {
    if (product) {
      const stockFields = {};
      for (const w of warehouses) {
        stockFields[`stock_${w.id}`] = product.stockByWarehouse?.[w.id] ?? 0;
      }
      form.resetFields(); // drop the previous product's category fields
      form.setFieldsValue({
        name: product.name,
        brand: product.brand,
        category: product.category,
        leadTimeDays: product.leadTimeDays,
        casePack: product.casePack ?? undefined,
        attributes: { ...product.attributes, color: product.attributes?.color ?? product.color ?? undefined },
        shadowParentId: product.shadowParentId ?? undefined,
        shadowIds: (product.shadows || []).map((s) => s.id),
        ...stockFields,
      });
    }
  }, [product, warehouses, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      const stock = warehouses.map((w) => ({
        warehouseId: w.id,
        onHand: values[`stock_${w.id}`] ?? 0,
      }));
      const { shadowParentId, shadowIds, ...fields } = values;
      for (const w of warehouses) delete fields[`stock_${w.id}`];

      // Shadow links change only when edited; linking never moves stock
      const shadowCalls = [];
      if (showShadows) {
        const oldIds = (product.shadows || []).map((s) => s.id).sort().join();
        if ((shadowParentId ?? null) !== (product.shadowParentId ?? null)) {
          shadowCalls.push(() => productsApi.setShadowParent(product.id, shadowParentId ?? null));
        }
        if ((shadowIds || []).slice().sort().join() !== oldIds) {
          shadowCalls.push(() => productsApi.setShadows(product.id, shadowIds || []));
        }
      }

      await Promise.all([
        productsApi.update(product.id, fields),
        ...(stock.length > 0 ? [productsApi.updateStock(product.id, stock)] : []),
      ]);
      for (const call of shadowCalls) await call();
      message.success(`Product ${product.sku} updated`);
      onClose();
      onUpdated();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to update product: ${err.message}`);
    }
  }

  return (
    <Modal title={`Edit Product — ${product?.sku ?? ""}`} open={open} onCancel={onClose} onOk={handleOk} okText="Save" destroyOnHidden>
      <Form form={form} layout="vertical" onValuesChange={prefillCasePack(form)}>
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
            <Form.Item name="leadTimeDays" label="Lead Time (days)">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>{CASE_PACK_ITEM}</Col>
        </Row>
        <CategoryFields category={category} />

        {warehouses.length > 0 && <Typography.Title level={5}>On-Hand Stock</Typography.Title>}
        <Row gutter={12}>
          {warehouses.map((w) => (
            <Col span={6} key={w.id}>
              <Form.Item name={`stock_${w.id}`} label={w.name}>
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          ))}
        </Row>
        {showShadows && product && <ShadowFields product={product} products={products} form={form} />}
      </Form>
    </Modal>
  );
}

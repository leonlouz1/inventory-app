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

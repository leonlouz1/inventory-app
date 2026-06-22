import { useEffect } from "react";
import { Modal, Form, Input, InputNumber, Select, Row, Col, Typography, message } from "antd";
import { productsApi } from "../api/inventory";
import { PRODUCT_CATEGORIES } from "../constants/categories";

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }));

export function NewProductModal({ open, onClose, onCreated, warehouses }) {
  const [form] = Form.useForm();

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
        category: values.category,
        reorderPoint: values.reorderPoint ?? 0,
        reorderQty: values.reorderQty ?? 0,
        leadTimeDays: values.leadTimeDays ?? 21,
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
      <Form form={form} layout="vertical" initialValues={{ reorderPoint: 0, reorderQty: 0, leadTimeDays: 21 }}>
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
        <Form.Item name="category" label="Category">
          <Select allowClear placeholder="Select category" options={CATEGORY_OPTIONS} />
        </Form.Item>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="reorderPoint" label="Reorder Point">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="reorderQty" label="Reorder Qty">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="leadTimeDays" label="Lead Time (days)">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Typography.Title level={5}>Initial On-Hand</Typography.Title>
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

export function EditProductModal({ open, onClose, onUpdated, product }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (product) {
      form.setFieldsValue({
        name: product.name,
        category: product.category,
        reorderPoint: product.reorderPoint,
        reorderQty: product.reorderQty,
        leadTimeDays: product.leadTimeDays,
      });
    }
  }, [product, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await productsApi.update(product.id, values);
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
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="category" label="Category">
          <Select allowClear placeholder="Select category" options={CATEGORY_OPTIONS} />
        </Form.Item>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="reorderPoint" label="Reorder Point">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="reorderQty" label="Reorder Qty">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="leadTimeDays" label="Lead Time (days)">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

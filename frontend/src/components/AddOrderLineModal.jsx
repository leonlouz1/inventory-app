import { useEffect, useMemo } from "react";
import { Modal, Form, Select, InputNumber, DatePicker, message } from "antd";
import dayjs from "dayjs";
import { ordersApi } from "../api/inventory";

export default function AddOrderLineModal({ open, onClose, onAdded, orderId, products, warehouses }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const skuOptions = useMemo(
    () => (products || []).map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products]
  );
  const warehouseOptions = useMemo(
    () => (warehouses || []).map((w) => ({ value: w.id, label: w.name })),
    [warehouses]
  );

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await ordersApi.addLine(orderId, {
        sku: values.sku,
        warehouse_id: values.warehouseId ?? null,
        quantity: values.quantity,
        ship_date: values.shipDate.format("YYYY-MM-DD"),
      });
      message.success("Line added");
      onClose();
      onAdded();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to add line: ${err.message}`);
    }
  }

  return (
    <Modal
      title="Add SKU to Order"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Add"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="sku" label="SKU" rules={[{ required: true, message: "Required" }]}>
          <Select
            showSearch
            placeholder="Select SKU"
            options={skuOptions}
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
        <Form.Item name="warehouseId" label="Warehouse">
          <Select allowClear placeholder="Unassigned" options={warehouseOptions} />
        </Form.Item>
        <Form.Item name="quantity" label="Qty" rules={[{ required: true, message: "Required" }]}>
          <InputNumber min={1} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="shipDate" label="Ship Date" rules={[{ required: true, message: "Required" }]}
          initialValue={dayjs()}>
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

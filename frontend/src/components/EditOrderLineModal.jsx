import { useEffect, useMemo } from "react";
import { Modal, Form, Select, InputNumber, DatePicker, message } from "antd";
import dayjs from "dayjs";
import { ordersApi } from "../api/inventory";

export default function EditOrderLineModal({ open, onClose, onUpdated, orderId, line, warehouses }) {
  const [form] = Form.useForm();
  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name })), [warehouses]);

  useEffect(() => {
    if (line) {
      form.setFieldsValue({
        warehouseId: line.warehouseId,
        quantity: line.quantity,
        shipDate: dayjs(line.shipDate),
      });
    }
  }, [line, form]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await ordersApi.updateLine(orderId, line.id, {
        warehouse_id: values.warehouseId ?? null,
        quantity: values.quantity,
        ship_date: values.shipDate.format("YYYY-MM-DD"),
      });
      message.success(`Line item updated for ${line.sku}`);
      onClose();
      onUpdated();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to update line item: ${err.message}`);
    }
  }

  return (
    <Modal
      title={`Edit Line Item — ${line?.sku ?? ""}`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="warehouseId" label="Warehouse">
          <Select allowClear placeholder="Unassigned" options={warehouseOptions} />
        </Form.Item>
        <Form.Item name="quantity" label="Qty" rules={[{ required: true, message: "Required" }]}>
          <InputNumber min={1} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="shipDate" label="Ship Date" rules={[{ required: true, message: "Required" }]}>
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

import { useState } from "react";
import { AutoComplete, Form, InputNumber, Modal, Segmented, Select, Typography, message } from "antd";
import { productsApi } from "../api/inventory";

const REASONS = ["Recount / cycle count", "Damaged", "Lost / missing", "Found", "Sample", "Customer return", "Correction"];

// Adjust one warehouse's on-hand for a product, with a reason (shows in Stock history)
export default function AdjustStockModal({ product, warehouses, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const mode = Form.useWatch("mode", form) ?? "change";
  const warehouseId = Form.useWatch("warehouseId", form);
  const qty = Form.useWatch("qty", form);

  const current = warehouseId != null ? product.stockByWarehouse?.[warehouseId] ?? 0 : null;
  const after = current == null || qty == null ? null : mode === "set" ? qty : current + qty;

  async function save() {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await productsApi.adjustStock(product.id, {
        warehouseId: v.warehouseId,
        reason: v.reason,
        ...(v.mode === "set" ? { setTo: v.qty } : { change: v.qty }),
      });
      message.success("Stock adjusted");
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`Adjust stock: ${product.sku}`}
      okText="Save adjustment"
      onOk={save}
      onCancel={onClose}
      confirmLoading={saving}
      okButtonProps={{ disabled: after != null && (after < 0 || after === current) }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ mode: "change", warehouseId: warehouses.length === 1 ? warehouses[0].id : undefined }}>
        <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: "Pick a warehouse" }]}>
          <Select
            placeholder="Pick a warehouse"
            options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${(product.stockByWarehouse?.[w.id] ?? 0).toLocaleString()} on hand)` }))}
          />
        </Form.Item>
        <Form.Item name="mode" label="How">
          <Segmented
            options={[
              { value: "change", label: "Add / remove units" },
              { value: "set", label: "Set to a counted number" },
            ]}
            onChange={() => form.setFieldValue("qty", undefined)}
          />
        </Form.Item>
        <Form.Item
          name="qty"
          label={mode === "set" ? "New on-hand quantity" : "Units to add (use a minus sign to remove, e.g. -24)"}
          rules={[
            { required: true, message: "Enter a quantity" },
            { validator: (_, v) => (mode === "change" && v === 0 ? Promise.reject(new Error("Can't be 0")) : Promise.resolve()) },
          ]}
        >
          <InputNumber style={{ width: "100%" }} precision={0} min={mode === "set" ? 0 : undefined} placeholder={mode === "set" ? "e.g. 600" : "e.g. -24 or 48"} />
        </Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true, whitespace: true, message: "Give a reason" }]}>
          <AutoComplete
            options={REASONS.map((r) => ({ value: r }))}
            placeholder="Pick one or type your own"
            filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
        {after != null && (
          <Typography.Text type={after < 0 ? "danger" : after === current ? "secondary" : undefined}>
            {after < 0
              ? `That would leave ${after}. Stock can't go below 0.`
              : after === current
                ? "No change"
                : `${current.toLocaleString()} → ${after.toLocaleString()} (${after > current ? "+" : ""}${(after - current).toLocaleString()})`}
          </Typography.Text>
        )}
      </Form>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Modal, Form, Select, InputNumber, message, Typography } from "antd";
import { warehousesApi } from "../api/inventory";

export default function WarehouseTransferModal({ open, onClose, onTransferred, products, warehouses }) {
  const [form] = Form.useForm();
  const [selectedSku, setSelectedSku] = useState(null);
  const [fromWarehouseId, setFromWarehouseId] = useState(null);

  useEffect(() => {
    if (open) {
      form.resetFields();
      setSelectedSku(null);
      setFromWarehouseId(null);
    }
  }, [open, form]);

  const skuOptions = useMemo(
    () => (products || []).map((p) => ({ value: p.sku, label: `${p.sku} — ${p.name}` })),
    [products]
  );

  const selectedProduct = useMemo(
    () => products?.find((p) => p.sku === selectedSku),
    [products, selectedSku]
  );

  // Only show warehouses that have stock for the selected SKU
  const fromOptions = useMemo(() => {
    if (!selectedProduct) return warehouses.map((w) => ({ value: w.id, label: w.name }));
    return (selectedProduct.stockByWarehouse || [])
      .filter((s) => s.onHand > 0)
      .map((s) => {
        const wh = warehouses.find((w) => w.id === s.warehouseId);
        return { value: s.warehouseId, label: `${wh?.name ?? s.warehouseId} (${s.onHand} units)` };
      });
  }, [selectedProduct, warehouses]);

  const toOptions = useMemo(
    () => warehouses
      .filter((w) => w.id !== fromWarehouseId)
      .map((w) => ({ value: w.id, label: w.name })),
    [warehouses, fromWarehouseId]
  );

  const maxQty = useMemo(() => {
    if (!selectedProduct || !fromWarehouseId) return undefined;
    return selectedProduct.stockByWarehouse?.find((s) => s.warehouseId === fromWarehouseId)?.onHand ?? 0;
  }, [selectedProduct, fromWarehouseId]);

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await warehousesApi.transfer({
        sku: values.sku,
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        quantity: values.quantity,
      });
      message.success(`Transferred ${values.quantity} units of ${values.sku}`);
      onClose();
      onTransferred();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Transfer failed: ${err.message}`);
    }
  }

  return (
    <Modal
      title="Warehouse Transfer"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Transfer"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="sku" label="SKU" rules={[{ required: true, message: "Required" }]}>
          <Select
            showSearch
            placeholder="Select SKU"
            options={skuOptions}
            filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
            onChange={(val) => { setSelectedSku(val); setFromWarehouseId(null); form.setFieldsValue({ fromWarehouseId: undefined, toWarehouseId: undefined, quantity: undefined }); }}
          />
        </Form.Item>
        <Form.Item name="fromWarehouseId" label="From Warehouse" rules={[{ required: true, message: "Required" }]}>
          <Select
            placeholder="Select source warehouse"
            options={fromOptions}
            disabled={!selectedSku}
            onChange={(val) => { setFromWarehouseId(val); form.setFieldsValue({ toWarehouseId: undefined, quantity: undefined }); }}
          />
        </Form.Item>
        <Form.Item name="toWarehouseId" label="To Warehouse" rules={[{ required: true, message: "Required" }]}>
          <Select
            placeholder="Select destination warehouse"
            options={toOptions}
            disabled={!fromWarehouseId}
          />
        </Form.Item>
        <Form.Item
          name="quantity"
          label={`Quantity${maxQty !== undefined ? ` (max ${maxQty})` : ""}`}
          rules={[
            { required: true, message: "Required" },
            { type: "number", min: 1, message: "Must be at least 1" },
            ...(maxQty !== undefined ? [{ type: "number", max: maxQty, message: `Cannot exceed ${maxQty} units available` }] : []),
          ]}
        >
          <InputNumber min={1} max={maxQty} style={{ width: "100%" }} disabled={!fromWarehouseId} />
        </Form.Item>
        {maxQty !== undefined && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {maxQty} units available in source warehouse
          </Typography.Text>
        )}
      </Form>
    </Modal>
  );
}

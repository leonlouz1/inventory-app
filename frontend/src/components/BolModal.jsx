import { useEffect, useState } from "react";
import { Modal, Form, Input, InputNumber, Select, Typography, Alert, Spin, message } from "antd";
import { shipmentsApi } from "../api/inventory";
import { authHeaders } from "../api/client";

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

// Bill of lading for a shipment: ship from, carrier, POs and case counts come
// from the shipment; this form fills in the rest. The ship-to is remembered
// per customer, so next time it's already filled in.
export default function BolModal({ shipment, onClose }) {
  const [form] = Form.useForm();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const terms = Form.useWatch("freightTerms", form);

  useEffect(() => {
    let active = true;
    shipmentsApi.bolDefaults(shipment.id)
      .then((d) => {
        if (!active) return;
        setData(d);
        form.setFieldsValue({ shipFromName: d.shipperNames[0], shipTo: d.shipTo, freightTerms: "PREPAID" });
      })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [shipment.id, form]);

  async function handleOk() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/shipments/${shipment.id}/bol`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Request failed: ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `BOL_${shipment.shipmentNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      message.error(`Couldn't make BOL: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  const from = data?.shipFrom;
  return (
    <Modal
      title={`Bill of Lading — ${shipment.shipmentNumber}`}
      open
      onCancel={onClose}
      onOk={handleOk}
      okText="Download BOL"
      okButtonProps={{ disabled: !data }}
      confirmLoading={saving}
      width={720}
      destroyOnHidden
    >
      {error && <Alert type="error" message={error} showIcon />}
      {!data && !error && <Spin />}
      {data && (
        <>
          {data.customers.length > 1 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`This shipment has orders for ${data.customers.join(", ")}. A BOL has one Ship To.`}
            />
          )}
          {!from.address && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`${from.warehouse || "This shipment's warehouse"} has no address yet. Add it on the Warehouses page so Ship From is filled in.`}
            />
          )}
          {data.missingCasePack && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Some products have no case pack, so their cases aren't counted. Set Case Pack on the Products page."
            />
          )}
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            From the shipment: {from.warehouse || "no warehouse"} warehouse · {data.carrier || "no carrier"}
            {data.proNumber ? ` · Pro ${data.proNumber}` : ""} · {data.orders.length} PO{data.orders.length === 1 ? "" : "s"} ·{" "}
            {data.totalCases} cases
          </Typography.Paragraph>
          <Form form={form} layout="vertical">
            <Form.Item
              name="shipFromName"
              label="Ship From name"
              extra={from.address ? `Address: ${from.address}, ${[from.city, from.state].filter(Boolean).join(", ")} ${from.zip || ""}` : undefined}
              style={{ maxWidth: 320 }}
            >
              <Select options={data.shipperNames.map((n) => ({ value: n, label: n }))} />
            </Form.Item>
            <Typography.Title level={5}>Ship To</Typography.Title>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", columnGap: 12 }}>
              <Form.Item name={["shipTo", "name"]} label="Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. TJX DC 0812" />
              </Form.Item>
              <Form.Item name={["shipTo", "locationNo"]} label="Location / DC #"><Input /></Form.Item>
            </div>
            <Form.Item name={["shipTo", "address"]} label="Street address" rules={[{ required: true, message: "Required" }]}>
              <Input />
            </Form.Item>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", columnGap: 12 }}>
              <Form.Item name={["shipTo", "city"]} label="City"><Input /></Form.Item>
              <Form.Item name={["shipTo", "state"]} label="State"><Input /></Form.Item>
              <Form.Item name={["shipTo", "zip"]} label="Zip"><Input /></Form.Item>
            </div>

            <Typography.Title level={5}>Freight</Typography.Title>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: 12 }}>
              <Form.Item name="pallets" label="Pallets"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="weight" label="Total weight (lb)"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
              <Form.Item name="freightClass" label="Class"><Input placeholder="e.g. 125" /></Form.Item>
              <Form.Item name="nmfc" label="NMFC #"><Input /></Form.Item>
              <Form.Item name="trailerNumber" label="Trailer #"><Input /></Form.Item>
              <Form.Item name="sealNumber" label="Seal #"><Input /></Form.Item>
              <Form.Item name="scac" label="SCAC"><Input /></Form.Item>
              <Form.Item name="freightTerms" label="Freight terms">
                <Select
                  options={[
                    { value: "PREPAID", label: "Prepaid" },
                    { value: "COLLECT", label: "Collect" },
                    { value: "THIRD_PARTY", label: "3rd Party" },
                  ]}
                />
              </Form.Item>
            </div>
            {terms === "THIRD_PARTY" && (
              <Form.Item name="billTo" label="3rd party bill to" rules={[{ required: true, message: "Required for 3rd Party" }]}>
                <Input.TextArea rows={2} placeholder="Name and address" />
              </Form.Item>
            )}
            <Form.Item name="specialInstructions" label="Special instructions" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

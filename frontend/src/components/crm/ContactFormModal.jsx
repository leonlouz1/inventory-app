import { useEffect, useMemo, useState } from "react";
import { DatePicker, Form, Input, Modal, Select, message } from "antd";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { CONTACT_CATEGORIES, CONTACT_ROLES, STATUSES } from "../../constants/crm";

const NEW_PREFIX = "new:";

// Add or edit one person. `defaults` prefills a new contact (retailerId, categories, role).
export default function ContactFormModal({ open, contact, defaults, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [retailers, setRetailers] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    crmApi.listRetailers().then(setRetailers).catch(() => {});
  }, [open]);

  const initialValues = contact
    ? { ...contact, nextFollowUp: contact.nextFollowUp ? dayjs(contact.nextFollowUp) : null }
    : { role: "Buyer", status: "Not Contacted", categories: [], ...defaults };

  const retailerOptions = useMemo(() => {
    const opts = retailers.map((r) => ({ value: r.id, label: r.name }));
    const term = search.trim();
    if (term && !retailers.some((r) => r.name.toLowerCase() === term.toLowerCase())) {
      opts.unshift({ value: `${NEW_PREFIX}${term}`, label: `+ Add "${term}" as a new retailer` });
    }
    return opts;
  }, [retailers, search]);

  async function handleOk() {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      let { retailerId } = values;
      if (typeof retailerId === "string" && retailerId.startsWith(NEW_PREFIX)) {
        const created = await crmApi.createRetailer({ name: retailerId.slice(NEW_PREFIX.length) });
        retailerId = created.id;
      }
      const data = { ...values, retailerId, nextFollowUp: values.nextFollowUp ? values.nextFollowUp.format("YYYY-MM-DD") : null };
      const saved = contact ? await crmApi.updateContact(contact.id, data) : await crmApi.createContact(data);
      message.success(`${saved.name} saved`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const role = Form.useWatch("role", form);

  return (
    <Modal
      title={contact ? `Edit ${contact.name}` : "New contact"}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      confirmLoading={saving}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
          <Input />
        </Form.Item>
        <Form.Item name="retailerId" label="Retailer" rules={[{ required: true, message: "Required" }]}>
          <Select
            showSearch
            placeholder="Search retailers"
            options={retailerOptions}
            onSearch={setSearch}
            filterOption={(input, opt) => String(opt.value).startsWith(NEW_PREFIX) || opt.label.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item name="role" label="Role" style={{ flex: 1 }}>
            <Select options={CONTACT_ROLES.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="categories" label="Categories" style={{ flex: 2 }}>
            <Select mode="multiple" options={CONTACT_CATEGORIES.map((c) => ({ value: c, label: c }))} placeholder="Pick one or more" />
          </Form.Item>
        </div>
        <Form.Item name="title" label="Title">
          <Input placeholder="e.g. Senior Buyer, Storage & Organization" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Not an email address" }]}>
          <Input />
        </Form.Item>
        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item name="directPhone" label="Direct #" style={{ flex: 1 }}><Input /></Form.Item>
          <Form.Item name="mobilePhone" label="Mobile #" style={{ flex: 1 }}><Input /></Form.Item>
          <Form.Item name="hqPhone" label="HQ #" style={{ flex: 1 }}><Input /></Form.Item>
        </div>
        {role === "Buyer" && (
          <div style={{ display: "flex", gap: 12 }}>
            <Form.Item name="status" label="Status" style={{ flex: 1 }}>
              <Select options={STATUSES.map((s) => ({ value: s, label: s }))} />
            </Form.Item>
            <Form.Item name="nextFollowUp" label="Next follow-up" style={{ flex: 1 }}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </div>
        )}
        <Form.Item name="notes" label="About this person">
          <Input.TextArea rows={2} placeholder="Anything worth remembering (not the history — log that instead)" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

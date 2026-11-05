import { useEffect, useMemo, useState } from "react";
import { DatePicker, Form, Input, Modal, Radio, Select, message } from "antd";
import dayjs from "dayjs";
import { crmApi } from "../../api/inventory";
import { CRM_CATEGORIES, defaultFollowUp } from "../../constants/crm";
import { fileToUpload } from "../../utils/crmFiles";
import { RecapFields } from "./LogForm";

const NEW_PREFIX = "new:";
const PITCH_ACTIONS = ["Emailed", "Called", "Sent Sample", "Meeting"];

// Pitch someone categories we don't know they buy: an existing contact or a new one.
// Logs the pitch and puts them on the Pitches page until they answer.
export default function PitchModal({ open, contact, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [contacts, setContacts] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [search, setSearch] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const who = Form.useWatch("who", form);

  useEffect(() => {
    if (!open) return;
    crmApi.listContacts().then(setContacts).catch(() => {});
    crmApi.listRetailers().then(setRetailers).catch(() => {});
  }, [open]);

  const retailerOptions = useMemo(() => {
    const opts = retailers.map((r) => ({ value: r.id, label: r.name }));
    const term = search.trim();
    if (term && !retailers.some((r) => r.name.toLowerCase() === term.toLowerCase())) {
      opts.unshift({ value: `${NEW_PREFIX}${term}`, label: `+ Add "${term}" as a new retailer` });
    }
    return opts;
  }, [retailers, search]);

  const contactOptions = useMemo(() => contacts.map((c) => ({
    value: c.id,
    label: `${c.name} · ${c.retailerName}${c.categories.length ? ` (${c.categories.join(", ")})` : ""}`,
  })), [contacts]);

  function close() {
    setFile(null);
    onClose();
  }

  async function handleOk() {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      let saved;
      if (values.who === "new") {
        let { retailerId } = values;
        if (typeof retailerId === "string" && retailerId.startsWith(NEW_PREFIX)) {
          const created = await crmApi.createRetailer({ name: retailerId.slice(NEW_PREFIX.length) });
          retailerId = created.id;
        }
        saved = await crmApi.createContact({
          name: values.name, retailerId, title: values.title, email: values.email,
          directPhone: values.directPhone, mobilePhone: values.mobilePhone,
          role: "Buyer", categories: [], pitchedCategories: values.categories,
        });
      } else {
        const existing = contacts.find((c) => c.id === values.contactId);
        saved = await crmApi.updateContact(existing.id, {
          pitchedCategories: [...new Set([...(existing.pitchedCategories || []), ...values.categories])],
        });
      }
      await crmApi.log({
        contactIds: [saved.id],
        action: values.action,
        pitch: true,
        note: `Pitched ${values.categories.join(", ")}${values.details ? `: ${values.details}` : ""}`,
        ...(file && { attachment: await fileToUpload(file) }),
        date: values.date.format("YYYY-MM-DD"),
        nextFollowUp: values.followUp ? values.followUp.format("YYYY-MM-DD") : null,
      });
      message.success(`Pitch to ${saved.name} logged`);
      onSaved?.(saved);
      close();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New pitch"
      open={open}
      onCancel={close}
      onOk={handleOk}
      okText="Log pitch"
      confirmLoading={saving}
      destroyOnHidden
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          who: contact ? "existing" : "new", contactId: contact?.id, categories: [],
          action: "Emailed", date: dayjs(), followUp: defaultFollowUp("Emailed"),
        }}
      >
        <Form.Item name="who" style={{ marginBottom: 12 }}>
          <Radio.Group optionType="button" options={[{ value: "new", label: "New contact" }, { value: "existing", label: "Already in the CRM" }]} />
        </Form.Item>
        {who === "existing" ? (
          <Form.Item name="contactId" label="Who" rules={[{ required: true, message: "Pick someone" }]}>
            <Select showSearch optionFilterProp="label" placeholder="Search contacts" options={contactOptions} />
          </Form.Item>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]} style={{ flex: 1 }}>
                <Input />
              </Form.Item>
              <Form.Item name="retailerId" label="Retailer" rules={[{ required: true, message: "Required" }]} style={{ flex: 1 }}>
                <Select
                  showSearch
                  placeholder="Search retailers"
                  options={retailerOptions}
                  onSearch={setSearch}
                  filterOption={(input, opt) => String(opt.value).startsWith(NEW_PREFIX) || opt.label.toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            </div>
            <Form.Item name="title" label="Title">
              <Input placeholder="e.g. Buyer, Home Décor" />
            </Form.Item>
            <div style={{ display: "flex", gap: 12 }}>
              <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Not an email address" }]} style={{ flex: 2 }}>
                <Input />
              </Form.Item>
              <Form.Item name="directPhone" label="Direct #" style={{ flex: 1 }}><Input /></Form.Item>
              <Form.Item name="mobilePhone" label="Mobile #" style={{ flex: 1 }}><Input /></Form.Item>
            </div>
          </>
        )}
        <Form.Item name="categories" label="Categories pitched" rules={[{ required: true, message: "Pick at least one" }]}>
          <Select mode="multiple" placeholder="Pick one or more" options={CRM_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Form.Item>
        <Form.Item name="action" label="How">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            size="small"
            options={PITCH_ACTIONS}
            onChange={(e) => form.setFieldValue("followUp", defaultFollowUp(e.target.value, form.getFieldValue("date")))}
          />
        </Form.Item>
        <Form.Item name="details" label="Pitch details">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder="What you sent or said: items, pricing, linesheet…" />
        </Form.Item>
        <RecapFields withText={false} fileLabel="pitch PDF" file={file} onFile={setFile} />
        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item name="date" label="Date" style={{ flex: 1 }}>
            <DatePicker allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="followUp" label="Follow up" style={{ flex: 1 }}>
            <DatePicker placeholder="None" style={{ width: "100%" }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

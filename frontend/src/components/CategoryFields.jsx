import { useEffect, useState } from "react";
import { Form, Input, Select, Divider, Button, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { productFieldsApi } from "../api/inventory";
import { loadFields, cacheFields } from "../hooks/useProductFields";

function DropdownWithAdd({ field, value, onChange, onOptionAdded }) {
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!newValue.trim()) return;
    setAdding(true);
    try {
      const updated = await productFieldsApi.addOption(field.key, newValue.trim());
      onOptionAdded(updated);
      onChange?.(updated.added);
      setNewValue("");
    } catch (err) {
      message.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      allowClear
      showSearch
      placeholder={`Select ${field.label}`}
      options={field.options.map((o) => ({ value: o, label: o }))}
      popupRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: "8px 0" }} />
          <div style={{ display: "flex", gap: 8, padding: "0 8px 4px" }}>
            <Input
              size="small"
              placeholder="New option"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              onPressEnter={handleAdd}
            />
            <Button size="small" type="text" icon={<PlusOutlined />} loading={adding} onClick={handleAdd}>
              Add new
            </Button>
          </div>
        </>
      )}
    />
  );
}

// Renders the fields that apply to `category` as Form.Items named
// ["attributes", key], marking the category's required ones as required.
// `exclude` hides fields the surrounding form already has (e.g. Color).
export default function CategoryFields({ category, exclude = [] }) {
  const [fields, setFields] = useState([]);

  useEffect(() => {
    let active = true;
    loadFields()
      .then((f) => { if (active) setFields(f); })
      .catch((err) => message.error(`Couldn't load category fields: ${err.message}`));
    return () => { active = false; };
  }, []);

  function handleOptionAdded(updated) {
    setFields((prev) => {
      const next = prev.map((f) => (f.key === updated.key ? { ...f, options: updated.options } : f));
      cacheFields(next);
      return next;
    });
  }

  const applicable = fields.filter((f) => category && f.categories?.[category] && !exclude.includes(f.key));
  if (applicable.length === 0) return null;

  return (
    <>
      <Divider titlePlacement="start" style={{ fontSize: 13, color: "#888", marginTop: 8 }}>
        {category} Details
      </Divider>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", columnGap: 12 }}>
        {applicable.map((f) => {
          const required = f.categories[category] === "required";
          return (
            <Form.Item
              key={f.key}
              name={["attributes", f.key]}
              label={f.label}
              rules={required ? [{ required: true, whitespace: true, message: `${f.label} is required` }] : []}
            >
              {Array.isArray(f.options)
                ? <DropdownWithAdd field={f} onOptionAdded={handleOptionAdded} />
                : <Input />}
            </Form.Item>
          );
        })}
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { Modal, List, Button, Input, Space, Popconfirm, message, Typography } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { crmApi } from "../../api/inventory";

export default function ManageRetailerTypesModal({ open, onClose, onChanged }) {
  const [types, setTypes] = useState([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) load();
  }, [open]);

  function load() {
    crmApi.listRetailerTypes().then(setTypes);
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await crmApi.createRetailerType(name);
      setNewName("");
      load();
      onChanged();
    } catch (err) {
      message.error(err.message.includes("Unique") ? `"${name}" already exists` : err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id) {
    const name = editingName.trim();
    if (!name) return;
    try {
      await crmApi.updateRetailerType(id, name);
      setEditingId(null);
      load();
      onChanged();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleDelete(id, name) {
    try {
      await crmApi.deleteRetailerType(id);
      load();
      onChanged();
    } catch (err) {
      message.error(`Could not delete "${name}"`);
    }
  }

  return (
    <Modal
      title="Manage Retailer Types"
      open={open}
      onCancel={onClose}
      footer={null}
      width={420}
      destroyOnHidden
    >
      <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
        <Input
          placeholder="New type name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={handleAdd}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={handleAdd}>
          Add
        </Button>
      </Space.Compact>

      <List
        size="small"
        dataSource={types}
        rowKey="id"
        renderItem={(t) => (
          <List.Item
            actions={
              editingId === t.id
                ? [
                    <Button
                      icon={<CheckOutlined />}
                      type="text"
                      size="small"
                      onClick={() => handleEdit(t.id)}
                    />,
                    <Button
                      icon={<CloseOutlined />}
                      type="text"
                      size="small"
                      onClick={() => setEditingId(null)}
                    />,
                  ]
                : [
                    <Button
                      icon={<EditOutlined />}
                      type="text"
                      size="small"
                      onClick={() => { setEditingId(t.id); setEditingName(t.name); }}
                    />,
                    <Popconfirm
                      title={`Delete "${t.name}"?`}
                      description="Retailers already using this type will keep it, but it won't appear in the dropdown."
                      onConfirm={() => handleDelete(t.id, t.name)}
                    >
                      <Button icon={<DeleteOutlined />} danger type="text" size="small" />
                    </Popconfirm>,
                  ]
            }
          >
            {editingId === t.id ? (
              <Input
                size="small"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onPressEnter={() => handleEdit(t.id)}
                style={{ width: 220 }}
                autoFocus
              />
            ) : (
              <Typography.Text>{t.name}</Typography.Text>
            )}
          </List.Item>
        )}
      />
    </Modal>
  );
}

import { useEffect, useState } from "react";
import {
  Typography, Button, Table, Input, Popconfirm, message, Modal, Tag, Spin, Space, Checkbox
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, BulbOutlined } from "@ant-design/icons";
import { skuGroupsApi } from "../api/inventory";

export default function SkuGroups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [editName, setEditName] = useState("");
  const [addSkuGroup, setAddSkuGroup] = useState(null);
  const [addSkuInput, setAddSkuInput] = useState("");
  const [addSkuLoading, setAddSkuLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  const [detectLoading, setDetectLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setGroups(await skuGroupsApi.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const group = await skuGroupsApi.create(newGroupName.trim());
      setGroups((prev) => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName("");
      message.success("Group created");
    } catch (err) {
      message.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRename() {
    if (!editName.trim()) return;
    try {
      const updated = await skuGroupsApi.update(editingGroup.id, editName.trim());
      setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g));
      setEditingGroup(null);
      message.success("Group renamed");
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await skuGroupsApi.delete(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      message.success("Group deleted");
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleAutoDetect() {
    setDetectLoading(true);
    try {
      const data = await skuGroupsApi.suggestions();
      setSuggestions(data);
      // Pre-select all suggestions that aren't already groups
      const existingNames = new Set(groups.map((g) => g.name));
      const preSelected = {};
      data.forEach((s) => { if (!existingNames.has(s.base)) preSelected[s.base] = true; });
      setSelectedSuggestions(preSelected);
    } catch (err) {
      message.error(err.message);
    } finally {
      setDetectLoading(false);
    }
  }

  async function handleCreateSuggested() {
    const toCreate = suggestions.filter((s) => selectedSuggestions[s.base]);
    if (!toCreate.length) return;
    setCreateLoading(true);
    try {
      for (const s of toCreate) {
        const group = await skuGroupsApi.create(s.base);
        for (const sku of s.skus) {
          await skuGroupsApi.addSku(group.id, sku.sku);
        }
      }
      message.success(`Created ${toCreate.length} group${toCreate.length > 1 ? "s" : ""}`);
      setSuggestions(null);
      load();
    } catch (err) {
      message.error(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleAddSku() {
    if (!addSkuInput.trim()) return;
    setAddSkuLoading(true);
    try {
      const updated = await skuGroupsApi.addSku(addSkuGroup.id, addSkuInput.trim());
      setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g));
      setAddSkuGroup(updated);
      setAddSkuInput("");
      message.success("SKU added to group");
    } catch (err) {
      message.error(err.message);
    } finally {
      setAddSkuLoading(false);
    }
  }

  async function handleRemoveSku(group, productId) {
    try {
      const updated = await skuGroupsApi.removeSku(group.id, productId);
      setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g));
      setAddSkuGroup((prev) => prev?.id === updated.id ? updated : prev);
      message.success("SKU removed");
    } catch (err) {
      message.error(err.message);
    }
  }

  const columns = [
    {
      title: "Group Name",
      dataIndex: "name",
      key: "name",
      render: (name) => <strong>{name}</strong>,
    },
    {
      title: "SKUs",
      key: "skus",
      render: (_, group) =>
        group.skus.length === 0
          ? <span style={{ color: "#bbb" }}>No SKUs</span>
          : group.skus.map((s) => <Tag key={s.productId}>{s.sku}</Tag>),
    },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, group) => (
        <Space>
          <Button size="small" icon={<PlusOutlined />} onClick={() => { setAddSkuGroup(group); setAddSkuInput(""); }}>
            Add SKU
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingGroup(group); setEditName(group.name); }} />
          <Popconfirm title="Delete this group? SKUs will be unlinked." onConfirm={() => handleDelete(group.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>SKU Groups</Typography.Title>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button icon={<BulbOutlined />} loading={detectLoading} onClick={handleAutoDetect}>
          Auto-detect Groups
        </Button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Input
          placeholder="New group name (e.g. 8110BLK)"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onPressEnter={handleCreate}
          style={{ maxWidth: 300 }}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={handleCreate}>
          Create Group
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        pagination={false}
        expandable={{
          rowExpandable: (g) => g.skus.length > 0,
          expandedRowRender: (group) => (
            <Table
              size="small"
              pagination={false}
              dataSource={group.skus}
              rowKey="productId"
              columns={[
                { title: "SKU", dataIndex: "sku" },
                { title: "Product", dataIndex: "name" },
                { title: "Brand", dataIndex: "brand", render: (v) => v || "—" },
                { title: "On Hand", dataIndex: "onHand", align: "right" },
                { title: "Committed", dataIndex: "committed", align: "right" },
                { title: "Incoming", dataIndex: "incoming", align: "right" },
                { title: "Available", dataIndex: "available", align: "right", render: (v) => <strong style={{ color: v < 0 ? "#f5222d" : undefined }}>{v}</strong> },
                {
                  title: "",
                  key: "remove",
                  render: (_, sku) => (
                    <Popconfirm title="Remove from group?" onConfirm={() => handleRemoveSku(group, sku.productId)}>
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          ),
        }}
      />

      {/* Rename modal */}
      <Modal
        title="Rename Group"
        open={!!editingGroup}
        onOk={handleRename}
        onCancel={() => setEditingGroup(null)}
        okText="Save"
      >
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} onPressEnter={handleRename} />
      </Modal>

      {/* Auto-detect suggestions modal */}
      <Modal
        title="Auto-detected SKU Groups"
        open={!!suggestions}
        onCancel={() => setSuggestions(null)}
        onOk={handleCreateSuggested}
        okText={`Create ${Object.values(selectedSuggestions).filter(Boolean).length} Group(s)`}
        confirmLoading={createLoading}
        width={600}
      >
        {suggestions?.length === 0 ? (
          <p>No ungrouped SKUs with matching suffixes found.</p>
        ) : (
          <>
            <p style={{ color: "#666", marginBottom: 12 }}>
              These SKUs share the same base. Check the ones you want to create as groups.
            </p>
            {suggestions?.map((s) => (
              <div key={s.base} style={{ marginBottom: 12, padding: "8px 12px", border: "1px solid #f0f0f0", borderRadius: 6 }}>
                <Checkbox
                  checked={!!selectedSuggestions[s.base]}
                  onChange={(e) => setSelectedSuggestions((prev) => ({ ...prev, [s.base]: e.target.checked }))}
                >
                  <strong>{s.base}</strong>
                </Checkbox>
                <div style={{ marginTop: 4, marginLeft: 24 }}>
                  {s.skus.map((sku) => (
                    <Tag key={sku.id} color={sku.groupId ? "orange" : "default"}>
                      {sku.sku}{sku.groupId ? " (already in a group)" : ""}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* Add SKU modal */}
      <Modal
        title={`Add SKU to "${addSkuGroup?.name}"`}
        open={!!addSkuGroup}
        onCancel={() => setAddSkuGroup(null)}
        footer={null}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Input
            placeholder="Enter SKU"
            value={addSkuInput}
            onChange={(e) => setAddSkuInput(e.target.value)}
            onPressEnter={handleAddSku}
          />
          <Button type="primary" loading={addSkuLoading} onClick={handleAddSku}>Add</Button>
        </div>
        {addSkuGroup?.skus.length > 0 && (
          <Table
            size="small"
            pagination={false}
            dataSource={addSkuGroup.skus}
            rowKey="productId"
            columns={[
              { title: "SKU", dataIndex: "sku" },
              { title: "Brand", dataIndex: "brand", render: (v) => v || "—" },
              { title: "Available", dataIndex: "available", align: "right" },
              {
                title: "",
                render: (_, sku) => (
                  <Popconfirm title="Remove?" onConfirm={() => handleRemoveSku(addSkuGroup, sku.productId)}>
                    <Button size="small" danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </Spin>
  );
}

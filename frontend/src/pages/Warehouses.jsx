import { useCallback, useEffect, useState } from "react";
import { Table, Button, Spin, Alert, Typography, Modal, Form, Input, message, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { warehousesApi } from "../api/inventory";

function NewWarehouseModal({ open, onClose, onCreated }) {
  const [form] = Form.useForm();

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await warehousesApi.create(values);
      message.success(`Warehouse "${values.name}" created`);
      form.resetFields();
      onClose();
      onCreated();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to create warehouse: ${err.message}`);
    }
  }

  return (
    <Modal
      title="Add Warehouse"
      open={open}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={handleOk}
      okText="Create"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
          <Input placeholder="Northeast" />
        </Form.Item>
        <Form.Item name="location" label="Location">
          <Input placeholder="City, state" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function EditWarehouseModal({ open, onClose, onUpdated, warehouse }) {
  const [form] = Form.useForm();

  async function handleOk() {
    try {
      const values = await form.validateFields();
      await warehousesApi.update(warehouse.id, values);
      message.success(`Warehouse "${values.name}" updated`);
      onClose();
      onUpdated();
    } catch (err) {
      if (err.errorFields) return;
      message.error(`Failed to update warehouse: ${err.message}`);
    }
  }

  return (
    <Modal
      title="Edit Warehouse"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ name: warehouse?.name, location: warehouse?.location }}>
        <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
          <Input placeholder="Northeast" />
        </Form.Item>
        <Form.Item name="location" label="Location">
          <Input placeholder="City, state" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);

  const loadWarehouses = useCallback(() => {
    setLoading(true);
    return warehousesApi
      .list()
      .then((data) => {
        setWarehouses(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  async function handleDelete(warehouse) {
    try {
      await warehousesApi.delete(warehouse.id);
      message.success(`${warehouse.name} deleted`);
      loadWarehouses();
    } catch (err) {
      message.error(err.message);
    }
  }

  const columns = [
    { title: "Name", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
    {
      title: "Location",
      dataIndex: "location",
      render: (v) => v || "—",
      sorter: (a, b) => (a.location || "").localeCompare(b.location || ""),
    },
    {
      title: "",
      key: "actions",
      render: (_, warehouse) => (
        <Popconfirm
          title={`Delete ${warehouse.name}?`}
          description="This is only allowed if it has no stock on hand, order lines, or restocks on record."
          onConfirm={(e) => {
            e?.stopPropagation();
            handleDelete(warehouse);
          }}
        >
          <Button icon={<DeleteOutlined />} danger type="text" onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      ),
    },
  ];

  if (error) {
    return <Alert type="error" message="Failed to load warehouses" description={error} showIcon />;
  }

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          Warehouses
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          Add Warehouse
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={warehouses}
        rowKey="id"
        pagination={false}
        onRow={(warehouse) => ({
          onClick: () => setEditingWarehouse(warehouse),
          style: { cursor: "pointer" },
        })}
      />

      <NewWarehouseModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={loadWarehouses} />

      <EditWarehouseModal
        open={!!editingWarehouse}
        onClose={() => setEditingWarehouse(null)}
        onUpdated={loadWarehouses}
        warehouse={editingWarehouse}
      />
    </Spin>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Table, Button, Spin, Alert, Typography, Modal, Form, Input, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
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

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

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

  const columns = [
    { title: "Name", dataIndex: "name" },
    { title: "Location", dataIndex: "location", render: (v) => v || "—" },
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

      <Table columns={columns} dataSource={warehouses} rowKey="id" pagination={false} />

      <NewWarehouseModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={loadWarehouses} />
    </Spin>
  );
}

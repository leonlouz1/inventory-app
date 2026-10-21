import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from "antd";
import { CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { linesheetsApi } from "../api/inventory";

// Saved linesheets for buyers; open one to edit prices and export it
export default function Linesheets() {
  const navigate = useNavigate();
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => linesheetsApi.list().then(setSheets).catch((err) => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const values = await form.validateFields();
    try {
      const sheet = await linesheetsApi.create(values);
      navigate(`/linesheets/${sheet.id}`);
    } catch (err) {
      message.error(err.message);
    }
  }

  async function run(fn, done) {
    try {
      const result = await fn();
      if (done) message.success(done);
      load();
      return result;
    } catch (err) {
      message.error(err.message);
      return null;
    }
  }

  if (error) return <Alert type="error" message="Couldn't load linesheets" description={error} showIcon />;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>Linesheets</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New linesheet</Button>
      </div>
      <Table
        rowKey="id"
        loading={!sheets}
        dataSource={sheets || []}
        locale={{ emptyText: "No linesheets yet" }}
        columns={[
          { title: "Name", dataIndex: "name", render: (n, s) => <Link to={`/linesheets/${s.id}`}><strong>{n}</strong></Link> },
          { title: "Customer", dataIndex: "customer", render: (v) => v || "—" },
          { title: "Products", dataIndex: "itemCount", align: "right" },
          { title: "Updated", dataIndex: "updatedAt", render: (v) => dayjs(v).format("MMM D, YYYY h:mm A") },
          {
            title: "",
            key: "actions",
            render: (_, s) => (
              <Space>
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  title="Duplicate (e.g. for another buyer)"
                  onClick={async () => {
                    const copy = await run(() => linesheetsApi.duplicate(s.id), "Duplicated");
                    if (copy) navigate(`/linesheets/${copy.id}`);
                  }}
                />
                <Popconfirm title={`Delete "${s.name}"?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => run(() => linesheetsApi.delete(s.id), "Deleted")}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="New linesheet" open={creating} onCancel={() => setCreating(false)} onOk={create} okText="Create" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="e.g. Velvet Hangers – Fall" autoFocus />
          </Form.Item>
          <Form.Item name="customer" label="Customer (optional)">
            <Input placeholder="e.g. TJX" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

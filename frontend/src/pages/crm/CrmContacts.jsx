import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Input, Select, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { crmApi } from "../../api/inventory";
import { CONTACT_CATEGORIES, CONTACT_ROLES, STATUS_COLORS } from "../../constants/crm";
import ContactDrawer, { PhoneLinks } from "../../components/crm/ContactDrawer";
import ContactFormModal from "../../components/crm/ContactFormModal";
import ImportCrmTabModal from "../../components/crm/ImportCrmTabModal";

// Every person at every retailer: buyers, DMMs, assistants, AP, logistics
export default function CrmContacts() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => crmApi.listContacts()
    .then((r) => { setRows(r); setError(null); })
    .catch((err) => setError(err.message)), []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((c) => {
      if (term && !`${c.name} ${c.retailerName} ${c.email || ""} ${c.title || ""}`.toLowerCase().includes(term)) return false;
      if (roles.length && !roles.includes(c.role)) return false;
      if (categories.length && !c.categories.some((x) => categories.includes(x))) return false;
      return true;
    });
  }, [rows, search, roles, categories]);

  if (error) return <Alert type="error" message={error} showIcon />;

  const columns = [
    {
      title: "Name", dataIndex: "name", width: 170,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (v) => <a style={{ fontWeight: 500 }}>{v}</a>,
    },
    {
      title: "Retailer", dataIndex: "retailerName", width: 150,
      sorter: (a, b) => a.retailerName.localeCompare(b.retailerName),
      render: (v, c) => (
        <Space size={4} wrap>
          <Link to={`/crm/accounts/${c.retailerId}`} onClick={(e) => e.stopPropagation()}>{v}</Link>
          {c.retailerArchived && <Tag style={{ margin: 0, fontSize: 11 }}>Archived</Tag>}
        </Space>
      ),
    },
    { title: "Role", dataIndex: "role", width: 120, sorter: (a, b) => a.role.localeCompare(b.role) },
    {
      title: "Categories", dataIndex: "categories", width: 170,
      render: (cats) => <Space size={2} wrap>{cats.map((c) => <Tag key={c} style={{ margin: 0 }}>{c}</Tag>)}</Space>,
    },
    { title: "Title", dataIndex: "title", width: 160, ellipsis: true },
    {
      title: "Status", dataIndex: "status", width: 120,
      render: (s, c) => (c.role === "Buyer" ? <Tag color={STATUS_COLORS[s]}>{s}</Tag> : null),
    },
    {
      title: "Contact", key: "contact", width: 240,
      render: (_, c) => (
        <div style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
          {c.email && <div><a href={`mailto:${c.email}`}>{c.email}</a></div>}
          <PhoneLinks contact={c} size={12} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Contacts <span style={{ color: "#aaa", fontWeight: 400, fontSize: 15 }}>({filtered.length})</span>
        </Typography.Title>
        <Space wrap>
          <Input.Search placeholder="Search name, retailer, email" allowClear style={{ width: 230 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select mode="multiple" placeholder="Role" allowClear style={{ minWidth: 140 }} maxTagCount="responsive"
            options={CONTACT_ROLES.map((r) => ({ value: r, label: r }))} value={roles} onChange={setRoles} />
          <Select mode="multiple" placeholder="Category" allowClear style={{ minWidth: 140 }} maxTagCount="responsive"
            options={CONTACT_CATEGORIES.map((c) => ({ value: c, label: c }))} value={categories} onChange={setCategories} />
          <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>Import tab</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add contact</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={rows === null}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 1250 }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["25", "50", "100", "200"] }}
        onRow={(c) => ({ onClick: () => setOpenId(c.id), style: { cursor: "pointer" } })}
      />
      {openId && <ContactDrawer key={openId} contactId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      <ContactFormModal open={adding} onClose={() => setAdding(false)} onSaved={(c) => { load(); setOpenId(c.id); }} />
      <ImportCrmTabModal open={importing} onClose={() => setImporting(false)} onImported={load} />
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Table, Input, Select, Checkbox, Button, Segmented, Modal, Tabs, Space, Popconfirm, Tooltip, message,
} from "antd";
import { SettingOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { upcApi } from "../api/inventory";

const BRAND_RANGES = [24, 25, 26, 27, 28, 29];
const CODE_KINDS = [
  { kind: "brand", label: "Brands", length: 2, example: "24" },
  { kind: "style", label: "Styles", length: 2, example: "11" },
  { kind: "color", label: "Colors", length: 1, example: "1" },
];

// 689528241111 -> 6-89528-24111-1
function formatUpc(upc) {
  return `${upc[0]}-${upc.slice(1, 6)}-${upc.slice(6, 11)}-${upc[11]}`;
}

function CodeList({ kind, length, example, codes, onChanged }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      await upcApi.addCode(kind, code.trim(), name.trim());
      setCode("");
      setName("");
      onChanged();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(row, newName) {
    if (!newName.trim() || newName === row.name) return;
    try {
      await upcApi.renameCode(row.id, newName.trim());
      onChanged();
    } catch (err) {
      message.error(err.message);
    }
  }

  async function handleDelete(row) {
    try {
      await upcApi.deleteCode(row.id);
      onChanged();
    } catch (err) {
      message.error(err.message);
    }
  }

  return (
    <>
      <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
        <Input
          placeholder={`Code (e.g. ${example})`}
          maxLength={length}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          style={{ width: 140 }}
        />
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={handleAdd} />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={saving}
          disabled={code.length !== length || !name.trim()}
          onClick={handleAdd}
        >
          Add
        </Button>
      </Space.Compact>
      <Table
        size="small"
        rowKey="id"
        dataSource={codes}
        pagination={false}
        locale={{ emptyText: "No codes yet" }}
        columns={[
          { title: "Code", dataIndex: "code", width: 80 },
          {
            title: "Name",
            dataIndex: "name",
            render: (v, row) => (
              <Typography.Text editable={{ onChange: (val) => handleRename(row, val), triggerType: ["icon", "text"] }}>
                {v}
              </Typography.Text>
            ),
          },
          {
            title: "",
            key: "delete",
            width: 48,
            render: (_, row) => (
              <Popconfirm title={`Delete ${kind} ${row.code}?`} onConfirm={() => handleDelete(row)}>
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
    </>
  );
}

export default function Upc() {
  const [brand, setBrand] = useState(24);
  const [rows, setRows] = useState([]);
  const [codes, setCodes] = useState({ brands: [], styles: [], colors: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [definedOnly, setDefinedOnly] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [savingSku, setSavingSku] = useState(null);

  const loadCodes = useCallback(() => upcApi.codes().then(setCodes), []);

  const loadRows = useCallback(() => {
    setLoading(true);
    return upcApi
      .list(brand)
      .then(setRows)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(() => { loadCodes(); }, [loadCodes]);
  useEffect(() => { loadRows(); }, [loadRows]);

  function handleCodesChanged() {
    loadCodes();
    loadRows();
  }

  async function handleToggle(row, inUse) {
    setSavingSku(row.sku);
    try {
      const updated = await upcApi.setInUse(row.sku, inUse);
      setRows((prev) => prev.map((r) => (r.sku === row.sku ? updated : r)));
      if (inUse && !row.product && updated.product) {
        message.success(`Added "${updated.product.name}" to Products`);
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setSavingSku(null);
    }
  }

  const brandNames = useMemo(
    () => Object.fromEntries(codes.brands.map((b) => [Number(b.code), b.name])),
    [codes.brands]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "inUse" && !r.inUse) return false;
      if (status === "available" && r.inUse) return false;
      if (definedOnly && !(r.styleName && r.colorName)) return false;
      if (!term) return true;
      return [r.sku, r.upc, r.styleName, r.colorName, r.product?.name]
        .some((v) => v && v.toLowerCase().includes(term));
    });
  }, [rows, search, status, definedOnly]);

  const inUseCount = rows.filter((r) => r.inUse).length;

  const columns = [
    { title: "SKU", dataIndex: "sku", width: 90, render: (v) => <strong>{v}</strong> },
    { title: "UPC", dataIndex: "upc", width: 170, render: (v) => <span style={{ fontFamily: "monospace" }}>{formatUpc(v)}</span> },
    {
      title: "Style",
      key: "style",
      render: (_, r) => (
        <span>
          <span style={{ color: "#8c8c8c" }}>{r.styleCode}</span> {r.styleName || <span style={{ color: "#bbb" }}>—</span>}
        </span>
      ),
    },
    {
      title: "Color",
      key: "color",
      render: (_, r) => (
        <span>
          <span style={{ color: "#8c8c8c" }}>{r.colorCode}</span> {r.colorName || <span style={{ color: "#bbb" }}>—</span>}
        </span>
      ),
    },
    { title: "Product", key: "product", render: (_, r) => r.product?.name || <span style={{ color: "#bbb" }}>—</span> },
    {
      title: "In use",
      dataIndex: "inUse",
      width: 80,
      align: "center",
      render: (inUse, r) => {
        const ready = r.brandName && r.styleName && r.colorName;
        const box = (
          <Checkbox
            checked={inUse}
            disabled={savingSku === r.sku || (!inUse && !ready)}
            onChange={(e) => handleToggle(r, e.target.checked)}
          />
        );
        if (inUse || ready) return box;
        return <Tooltip title="Set up this number's brand, style and color under Manage Codes first">{box}</Tooltip>;
      },
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>UPC Codes</Typography.Title>
        <Button icon={<SettingOutlined />} onClick={() => setCodesOpen(true)}>Manage Codes</Button>
      </div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        UPC = 689528 + 2-digit brand + 2-digit style + 1-digit color + check digit. The middle 5 digits are the SKU.
        Marking a number <strong>In use</strong> adds it to Products.
      </Typography.Paragraph>

      <Segmented
        value={brand}
        onChange={setBrand}
        options={BRAND_RANGES.map((b) => ({ value: b, label: `${b} · ${brandNames[b] || "Unassigned"}` }))}
        style={{ marginBottom: 16, maxWidth: "100%", overflowX: "auto" }}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input.Search
          placeholder="Search SKU, UPC, style, color"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          style={{ width: 150 }}
          options={[
            { value: "all", label: "All numbers" },
            { value: "available", label: "Available" },
            { value: "inUse", label: "In use" },
          ]}
        />
        <Checkbox checked={definedOnly} onChange={(e) => setDefinedOnly(e.target.checked)}>
          Only numbers with style &amp; color set up
        </Checkbox>
        <span style={{ marginLeft: "auto", color: "#8c8c8c" }}>{inUseCount} of 1000 in use</span>
      </div>

      <Table
        rowKey="sku"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={filteredRows}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["50", "100", "200"] }}
      />

      <Modal title="Manage Codes" open={codesOpen} onCancel={() => setCodesOpen(false)} footer={null} width={560} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          Codes are shared by every brand: style 11 and color 1 mean the same thing in 24xxx, 25xxx and so on.
        </Typography.Paragraph>
        <Tabs
          items={CODE_KINDS.map((k) => ({
            key: k.kind,
            label: k.label,
            children: (
              <CodeList
                kind={k.kind}
                length={k.length}
                example={k.example}
                codes={codes[`${k.kind}s`]}
                onChanged={handleCodesChanged}
              />
            ),
          }))}
        />
      </Modal>
    </>
  );
}

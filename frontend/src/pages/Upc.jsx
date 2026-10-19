import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Table, Input, InputNumber, Select, Checkbox, Button, Segmented, Modal, Tabs, Space, Popconfirm, Tooltip,
  Form, message,
} from "antd";
import { SettingOutlined, DeleteOutlined, PlusOutlined, EditOutlined } from "@ant-design/icons";
import { upcApi } from "../api/inventory";
import { PRODUCT_BRANDS } from "../constants/brands";
import { PRODUCT_CATEGORIES } from "../constants/categories";
import CategoryFields from "../components/CategoryFields";
import { useRequiredFieldKeys } from "../hooks/useProductFields";

const BRAND_RANGES = [24, 25, 26, 27, 28, 29];
const CODE_KINDS = [
  { kind: "brand", label: "Brands", length: 2, example: "24" },
  { kind: "style", label: "Styles", length: 2, example: "11" },
  { kind: "color", label: "Colors", length: 1, example: "1" },
  { kind: "range", label: "Other categories", length: 2, example: "30" },
];

const COMPANY_PREFIX = "689528";
const TRAVEL_RANGES = new Set(["24", "25", "26", "27", "28", "29"]);

// Full 12-digit UPC-A for a 5-digit item number (same math as the backend)
function upcFor(sku) {
  const first11 = COMPANY_PREFIX + sku;
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    if (i % 2 === 0) odd += Number(first11[i]);
    else even += Number(first11[i]);
  }
  return first11 + ((10 - ((odd * 3 + even) % 10)) % 10);
}

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

// One row per style + color, one In use checkbox per brand.
function AllBrandsGrid({ codesVersion }) {
  const [data, setData] = useState({ brands: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const [savingSku, setSavingSku] = useState(null);

  useEffect(() => {
    setLoading(true);
    upcApi.grid()
      .then(setData)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [codesVersion]);

  async function handleToggle(row, brandCode, inUse) {
    const cell = row.brands[brandCode];
    setSavingSku(cell.sku);
    try {
      const updated = await upcApi.setInUse(cell.sku, inUse);
      setData((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => r.key !== row.key ? r : {
          ...r,
          brands: { ...r.brands, [brandCode]: { sku: cell.sku, inUse: updated.inUse, product: updated.product } },
        }),
      }));
      if (inUse && !cell.product && updated.product) {
        message.success(`Added "${updated.product.name}" to Products`);
      }
    } catch (err) {
      message.error(err.message);
    } finally {
      setSavingSku(null);
    }
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (usedOnly && !Object.values(r.brands).some((c) => c.inUse)) return false;
      if (!term) return true;
      return [r.key, r.styleName, r.colorName].some((v) => v.toLowerCase().includes(term));
    });
  }, [data.rows, search, usedOnly]);

  const columns = [
    { title: "Number", dataIndex: "key", width: 90, render: (v) => <strong style={{ fontFamily: "monospace" }}>{v}</strong> },
    {
      title: "Style",
      key: "style",
      render: (_, r) => <span><span style={{ color: "#8c8c8c" }}>{r.styleCode}</span> {r.styleName}</span>,
    },
    {
      title: "Color",
      key: "color",
      render: (_, r) => <span><span style={{ color: "#8c8c8c" }}>{r.colorCode}</span> {r.colorName}</span>,
    },
    ...data.brands.map((b) => ({
      title: <div style={{ textAlign: "center" }}>{b.name}<div style={{ color: "#8c8c8c", fontWeight: 400 }}>{b.code}</div></div>,
      key: `brand-${b.code}`,
      align: "center",
      width: 130,
      render: (_, r) => {
        const cell = r.brands[b.code];
        return (
          <Tooltip title={cell.product?.name}>
            <Checkbox
              checked={cell.inUse}
              disabled={savingSku === cell.sku}
              onChange={(e) => handleToggle(r, b.code, e.target.checked)}
            />
            <div style={{ fontSize: 11, color: cell.inUse ? undefined : "#bbb", fontFamily: "monospace" }}>{cell.sku}</div>
          </Tooltip>
        );
      },
    })),
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input.Search
          placeholder="Search number, style, color"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Checkbox checked={usedOnly} onChange={(e) => setUsedOnly(e.target.checked)}>
          Only show combinations in use
        </Checkbox>
      </div>
      <Table
        rowKey="key"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={filteredRows}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: "Add style and color codes under Manage Codes to see combinations here" }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["50", "100", "200"] }}
      />
    </>
  );
}

// Other-category ranges (e.g. 23 Storage & Organization): numbers don't encode
// anything, so each one gets a typed-in name, brand, color, category and pack size.
function OtherNumberModal({ row, onClose, onSaved }) {
  const [form] = Form.useForm();
  const category = Form.useWatch("category", form);
  const requiredKeys = useRequiredFieldKeys(category);
  const [saving, setSaving] = useState(false);

  async function handleOk() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await upcApi.saveNumber(row.sku, {
        ...values,
        attributes: { ...row.attributes, ...values.attributes },
        inUse: Boolean(values.inUse),
      });
      if (values.inUse && !row.product && updated.product) {
        message.success(`Added "${updated.product.name}" to Products`);
      }
      onSaved(updated);
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={row ? `${row.sku} · ${formatUpc(row.upc)}` : ""}
      open={!!row}
      onCancel={onClose}
      onOk={handleOk}
      okText="Save"
      confirmLoading={saving}
      destroyOnHidden
    >
      {row && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            name: row.name, brand: row.brand, color: row.color, category: row.category,
            packSize: row.packSize, inUse: row.inUse || row.startInUse, attributes: row.attributes,
          }}
        >
          <Form.Item
            name="name"
            label="Name"
            dependencies={["inUse"]}
            rules={[({ getFieldValue }) => ({
              validator: (_, v) => (getFieldValue("inUse") && !v?.trim()
                ? Promise.reject(new Error("Required to mark in use")) : Promise.resolve()),
            })]}
          >
            <Input placeholder="e.g. Velvet Hanger" />
          </Form.Item>
          <Space.Compact style={{ width: "100%" }}>
            <Form.Item name="brand" label="Brand" style={{ flex: 1 }}>
              <Select allowClear placeholder="None" options={PRODUCT_BRANDS.map((b) => ({ value: b, label: b }))} />
            </Form.Item>
            <Form.Item
              name="color"
              label="Color"
              style={{ flex: 1, marginLeft: 12 }}
              rules={requiredKeys.has("color") ? [{ required: true, whitespace: true, message: "Color is required" }] : []}
            >
              <Input placeholder="e.g. Black" />
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: "100%" }}>
            <Form.Item name="category" label="Category" style={{ flex: 2 }}>
              <Select allowClear placeholder="None" options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
            <Form.Item
              name="packSize"
              label="Pack size"
              style={{ flex: 1, marginLeft: 12 }}
              rules={requiredKeys.has("packSize") ? [{ required: true, message: "Pack size is required" }] : []}
            >
              <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="e.g. 10" />
            </Form.Item>
          </Space.Compact>
          <CategoryFields category={category} exclude={["color", "packSize"]} />
          <Form.Item name="inUse" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>
              In use {row.product ? "" : "(adds it to Products)"}
            </Checkbox>
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

// Step 1 of creating a number by hand: type the 5 digits, see the UPC, then
// continue to the details form.
function CreateNumberModal({ open, onClose, onContinue }) {
  const [sku, setSku] = useState("");
  const [checking, setChecking] = useState(false);
  const valid = /^\d{5}$/.test(sku);
  const travel = valid && TRAVEL_RANGES.has(sku.slice(0, 2));

  async function handleContinue() {
    setChecking(true);
    try {
      const row = await upcApi.number(sku);
      if (row.product) {
        message.info(`${sku} is already a product: "${row.product.name}"`);
      }
      onContinue({ ...row, startInUse: true });
      setSku("");
    } catch (err) {
      message.error(err.message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal
      title="Create a UPC"
      open={open}
      onCancel={() => { setSku(""); onClose(); }}
      onOk={handleContinue}
      okText="Continue"
      okButtonProps={{ disabled: !valid || travel }}
      confirmLoading={checking}
      destroyOnHidden
      width={420}
    >
      <Typography.Paragraph type="secondary">
        Enter the 5-digit item number (it becomes the SKU). The check digit is calculated for you.
      </Typography.Paragraph>
      <Input
        autoFocus
        size="large"
        maxLength={5}
        placeholder="e.g. 22048"
        value={sku}
        onChange={(e) => setSku(e.target.value.replace(/\D/g, ""))}
        onPressEnter={() => { if (valid && !travel) handleContinue(); }}
        style={{ fontFamily: "monospace" }}
      />
      <div style={{ marginTop: 16, minHeight: 48 }}>
        {valid && !travel && (
          <>
            <div style={{ color: "#8c8c8c", fontSize: 12 }}>UPC</div>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 600 }}>{formatUpc(upcFor(sku))}</div>
          </>
        )}
        {travel && (
          <Typography.Text type="warning">24xxx–29xxx are Travel numbers. Create those on the Travel tab.</Typography.Text>
        )}
      </div>
    </Modal>
  );
}

function OtherRangeView({ ranges }) {
  const [range, setRange] = useState(ranges[0]?.code ?? "custom");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [savingSku, setSavingSku] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const activeRange = range === "custom" || ranges.some((r) => r.code === range) ? range : ranges[0]?.code ?? "custom";

  useEffect(() => {
    setLoading(true);
    (activeRange === "custom" ? upcApi.custom() : upcApi.list(activeRange))
      .then(setRows)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [activeRange, reloadKey]);

  function replaceRow(updated) {
    if (rows.some((r) => r.sku === updated.sku)) {
      setRows((prev) => prev.map((r) => (r.sku === updated.sku ? updated : r)));
    } else {
      setReloadKey((k) => k + 1); // created outside this tab's list
    }
  }

  async function handleToggle(row, inUse) {
    if (inUse && !row.name) {
      setEditing(row);
      return;
    }
    setSavingSku(row.sku);
    try {
      const updated = await upcApi.saveNumber(row.sku, { inUse });
      replaceRow(updated);
      if (inUse && !row.product && updated.product) message.success(`Added "${updated.product.name}" to Products`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSavingSku(null);
    }
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "inUse" && !r.inUse) return false;
      if (status === "available" && (r.inUse || r.name)) return false;
      if (!term) return true;
      return [r.sku, r.upc, r.name, r.brand, r.color, r.category, r.product?.name]
        .some((v) => v && v.toLowerCase().includes(term));
    });
  }, [rows, search, status]);

  const dash = <span style={{ color: "#bbb" }}>—</span>;
  const columns = [
    { title: "SKU", dataIndex: "sku", width: 90, render: (v) => <strong>{v}</strong> },
    { title: "UPC", dataIndex: "upc", width: 170, render: (v) => <span style={{ fontFamily: "monospace" }}>{formatUpc(v)}</span> },
    { title: "Name", dataIndex: "name", render: (v) => v || dash },
    { title: "Brand", dataIndex: "brand", render: (v) => v || dash },
    { title: "Color", dataIndex: "color", render: (v) => v || dash },
    { title: "Category", dataIndex: "category", render: (v) => v || dash },
    { title: "Pack", dataIndex: "packSize", width: 70, align: "right", render: (v) => v || dash },
    {
      title: "In use",
      dataIndex: "inUse",
      width: 70,
      align: "center",
      render: (inUse, r) => (
        <Checkbox checked={inUse} disabled={savingSku === r.sku} onChange={(e) => handleToggle(r, e.target.checked)} />
      ),
    },
    {
      title: "",
      key: "edit",
      width: 48,
      render: (_, r) => <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} />,
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Segmented
          value={activeRange}
          onChange={setRange}
          options={[
            ...ranges.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` })),
            { value: "custom", label: "Other numbers" },
          ]}
          style={{ maxWidth: "100%", overflowX: "auto" }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Create</Button>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input.Search
          placeholder="Search SKU, UPC, name, color"
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
        <span style={{ marginLeft: "auto", color: "#8c8c8c" }}>
          {activeRange === "custom"
            ? `${rows.length} number${rows.length === 1 ? "" : "s"} outside the named ranges`
            : `${rows.filter((r) => r.inUse).length} of 1000 in use`}
        </span>
      </div>
      <Table
        rowKey="sku"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={filteredRows}
        scroll={{ x: "max-content" }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["50", "100", "200"] }}
      />
      <OtherNumberModal row={editing} onClose={() => setEditing(null)} onSaved={replaceRow} />
      <CreateNumberModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onContinue={(row) => { setCreateOpen(false); setEditing(row); }}
      />
    </>
  );
}

export default function Upc() {
  const [section, setSection] = useState("travel");
  const [brand, setBrand] = useState("all");
  const [codesVersion, setCodesVersion] = useState(0);
  const [rows, setRows] = useState([]);
  const [codes, setCodes] = useState({ brands: [], styles: [], colors: [], ranges: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [definedOnly, setDefinedOnly] = useState(false);
  const [codesOpen, setCodesOpen] = useState(false);
  const [savingSku, setSavingSku] = useState(null);

  const loadCodes = useCallback(() => upcApi.codes().then(setCodes), []);

  const loadRows = useCallback(() => {
    if (section !== "travel" || brand === "all") return Promise.resolve();
    setLoading(true);
    return upcApi
      .list(brand)
      .then(setRows)
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [brand, section]);

  useEffect(() => { loadCodes(); }, [loadCodes]);
  useEffect(() => { loadRows(); }, [loadRows]);

  function handleCodesChanged() {
    loadCodes();
    loadRows();
    setCodesVersion((v) => v + 1);
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
      <Segmented
        value={section}
        onChange={setSection}
        options={[{ value: "travel", label: "Travel" }, { value: "other", label: "Other categories" }]}
        size="large"
        style={{ marginBottom: 12 }}
      />
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {section === "travel"
          ? <>UPC = 689528 + 2-digit brand + 2-digit style + 1-digit color + check digit. The middle 5 digits are the SKU.</>
          : <>Numbers in these ranges don&apos;t encode anything. Fill in each number&apos;s details yourself.</>}
        {" "}Marking a number <strong>In use</strong> adds it to Products.
      </Typography.Paragraph>

      {section === "other" ? <OtherRangeView key={codes.ranges.map((r) => r.code).join()} ranges={codes.ranges} /> : <>
      <Segmented
        value={brand}
        onChange={setBrand}
        options={[
          { value: "all", label: "All brands" },
          ...BRAND_RANGES.map((b) => ({ value: b, label: `${b} · ${brandNames[b] || "Unassigned"}` })),
        ]}
        style={{ marginBottom: 16, maxWidth: "100%", overflowX: "auto" }}
      />

      {brand === "all" ? <AllBrandsGrid codesVersion={codesVersion} /> : <>
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
      </>}
      </>}

      <Modal title="Manage Codes" open={codesOpen} onCancel={() => setCodesOpen(false)} footer={null} width={560} destroyOnHidden>
        <Typography.Paragraph type="secondary">
          Travel codes are shared by every brand: style 11 and color 1 mean the same thing in 24xxx, 25xxx and so on.
          Other categories are the non-Travel ranges, like 23 Storage &amp; Organization.
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

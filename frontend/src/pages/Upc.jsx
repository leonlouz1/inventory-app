import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Typography, Table, Input, InputNumber, Select, Checkbox, Button, Segmented, Modal, Tabs, Space, Popconfirm, Tooltip,
  Form, AutoComplete, message,
} from "antd";
import {
  SettingOutlined, DeleteOutlined, PlusOutlined, EditOutlined, DisconnectOutlined, GroupOutlined, BarcodeOutlined,
} from "@ant-design/icons";
import { upcApi } from "../api/inventory";
import { PRODUCT_BRANDS } from "../constants/brands";
import { PRODUCT_CATEGORIES, DEFAULT_CASE_PACK } from "../constants/categories";
import CategoryFields from "../components/CategoryFields";
import BarcodeModal from "../components/BarcodeModal";
import { useRequiredFieldKeys } from "../hooks/useProductFields";

const BRAND_RANGES = [24, 25, 26, 27, 28, 29];
const CODE_KINDS = [
  { kind: "brand", label: "Brands", length: 2, example: "24" },
  { kind: "style", label: "Styles", length: 2, example: "11" },
  { kind: "color", label: "Colors", length: 1, example: "1" },
  { kind: "range", label: "Other categories", length: 2, example: "30" },
];

const COMPANY_PREFIX = "689528";

// Picking a category with a standard case pack (Neck Pillows = 24) fills it in
// when the field is still empty.
function prefillCasePack(form) {
  return (changed) => {
    const preset = DEFAULT_CASE_PACK[changed.category];
    if ("category" in changed && preset && !form.getFieldValue("casePack")) form.setFieldsValue({ casePack: preset });
  };
}
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
  const [barcode, setBarcode] = useState(null);
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
            <div style={{ fontSize: 11, color: cell.inUse ? undefined : "#bbb", fontFamily: "monospace" }}>
              {cell.sku}
              <Button
                type="text"
                size="small"
                icon={<BarcodeOutlined />}
                title="Barcode artwork"
                onClick={() => setBarcode({
                  upc: upcFor(cell.sku), sku: cell.sku,
                  label: cell.product?.name || `${b.name} ${r.styleName} ${r.colorName}`,
                })}
              />
            </div>
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
      {barcode && <BarcodeModal {...barcode} onClose={() => setBarcode(null)} />}
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
      } else if (row.linking && values.inUse) {
        message.success(`Linked existing product "${updated.product.name}"`);
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
      {row?.linking && (
        <Typography.Paragraph type="secondary">
          {row.sku} is already a product (&quot;{row.product.name}&quot;). Its details are filled in below. Saving adds it
          to the UPC list and links it; the product itself isn&apos;t changed{row.productUpc ? "" : ", except its UPC is filled in"}.
        </Typography.Paragraph>
      )}
      {row && (
        <Form
          form={form}
          layout="vertical"
          onValuesChange={prefillCasePack(form)}
          initialValues={{
            name: row.name, brand: row.brand, color: row.color, category: row.category,
            packSize: row.packSize, casePack: row.casePack ?? DEFAULT_CASE_PACK[row.category],
            inUse: row.inUse || row.startInUse, attributes: row.attributes,
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
            <Form.Item
              name="casePack"
              label="Case pack"
              tooltip="Units per case"
              style={{ flex: 1, marginLeft: 12 }}
            >
              <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="e.g. 24" />
            </Form.Item>
          </Space.Compact>
          <CategoryFields category={category} exclude={["color", "packSize"]} />
          <Form.Item name="inUse" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>
              In use {row.product ? (row.linking ? "(links the existing product)" : "") : "(adds it to Products)"}
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
      if (row.productUpc) {
        message.warning(`${sku}'s product already has UPC ${row.productUpc}, which doesn't match ${row.upc}. It won't be changed.`);
      }
      // Already a product: fill the form from it so saving just links it
      onContinue(row.prefill ? { ...row, ...row.prefill, linking: true, startInUse: true } : { ...row, startInUse: true });
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

// Turn a list of numbers into table rows: numbers in a group become one
// expandable row per group, other filled-in numbers stay as single rows, and
// numbers with no details yet collapse into one "available" row.
function groupOtherRows(rows, groups) {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const members = new Map();
  const result = [];
  let available = 0;
  for (const r of rows) {
    if (r.groupId && groupName.has(r.groupId)) {
      if (!members.has(r.groupId)) {
        members.set(r.groupId, []);
        result.push({ key: `g:${r.groupId}`, isGroup: true, groupId: r.groupId, groupName: groupName.get(r.groupId) });
      }
      members.get(r.groupId).push(r);
    } else if (r.name) {
      result.push(r);
    } else {
      available += 1;
    }
  }
  for (const g of result) if (g.isGroup) g.children = members.get(g.groupId);
  if (available > 0) result.push({ key: "available", isAvailable: true, count: available });
  return result;
}

const uniqueJoin = (values) => [...new Set(values.filter((v) => v != null && v !== ""))].join(", ");

// New product family: shared details once, then every color x pack size
// combination gets the next free number.
function CreateGroupModal({ open, range, colorOptions, onClose, onCreated }) {
  const [form] = Form.useForm();
  const category = Form.useWatch("category", form);
  const watchedColors = Form.useWatch("colors", form);
  const watchedPacks = Form.useWatch("packs", form);
  const startSku = Form.useWatch("startSku", form) || "";
  const [preview, setPreview] = useState([]);
  const [previewError, setPreviewError] = useState(null);
  const [saving, setSaving] = useState(false);

  const variants = useMemo(() => {
    const colors = watchedColors || [];
    const packs = watchedPacks || [];
    if (!colors.length && !packs.length) return [];
    const cs = colors.length ? colors : [null];
    const ps = packs.length ? packs : [null];
    return cs.flatMap((color) => ps.map((packSize) => ({ color, packSize })));
  }, [watchedColors, watchedPacks]);

  // Suggest the first free number in this range
  useEffect(() => {
    if (!open || range === "custom") return;
    upcApi.nextFree(`${range}000`, 1)
      .then(([first]) => { if (!form.getFieldValue("startSku")) form.setFieldsValue({ startSku: first.sku }); })
      .catch(() => {});
  }, [open, range, form]);

  // Preview the exact numbers the group will get
  const canPreview = open && /^\d{5}$/.test(startSku) && variants.length > 0;
  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    upcApi.nextFree(startSku, variants.length)
      .then((nums) => { if (active) { setPreview(nums); setPreviewError(null); } })
      .catch((err) => { if (active) { setPreview([]); setPreviewError(err.message); } });
    return () => { active = false; };
  }, [canPreview, startSku, variants.length]);
  const shown = canPreview && preview.length === variants.length ? preview : [];

  async function handleOk() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await upcApi.createGroup({
        groupName: values.groupName,
        startSku: values.startSku,
        base: {
          name: values.name, brand: values.brand, category: values.category, casePack: values.casePack,
          attributes: values.attributes || {},
        },
        variants,
        inUse: values.inUse,
      });
      message.success(`Created ${result.group.name} (${result.skus.length} numbers)`);
      form.resetFields();
      onCreated();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const name = Form.useWatch("name", form);
  return (
    <Modal
      title="Create group"
      open={open}
      onCancel={() => { form.resetFields(); onClose(); }}
      onOk={handleOk}
      okText={`Create ${shown.length || ""} number${shown.length === 1 ? "" : "s"}`}
      okButtonProps={{ disabled: shown.length === 0 }}
      confirmLoading={saving}
      width={680}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ inUse: true, colors: [], packs: [] }} onValuesChange={prefillCasePack(form)}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 12 }}>
          <Form.Item name="name" label="Product name" rules={[{ required: true, whitespace: true, message: "Required" }]}>
            <Input placeholder="e.g. Shoe Rack" />
          </Form.Item>
          <Form.Item name="groupName" label="Group name" extra="Defaults to the product name">
            <Input placeholder={name || ""} />
          </Form.Item>
          <Form.Item name="brand" label="Brand">
            <Select allowClear placeholder="None" options={PRODUCT_BRANDS.map((b) => ({ value: b, label: b }))} />
          </Form.Item>
          <Form.Item name="category" label="Category">
            <Select allowClear placeholder="None" options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item name="colors" label="Colors" extra="Type a color and press Enter">
            <Select mode="tags" placeholder="e.g. Silver" options={colorOptions.map((c) => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item
            name="packs"
            label="Pack sizes"
            extra="Type a number and press Enter"
            normalize={(v) => (v || []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0)}
          >
            <Select mode="tags" placeholder="e.g. 1, 2, 4" />
          </Form.Item>
          <Form.Item name="casePack" label="Case pack" tooltip="Units per case, the same for every number in the group">
            <InputNumber min={1} precision={0} style={{ width: "100%" }} placeholder="e.g. 24" />
          </Form.Item>
        </div>
        <CategoryFields category={category} exclude={["color", "packSize"]} />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Form.Item
            name="startSku"
            label="Starting number"
            rules={[{ pattern: /^\d{5}$/, message: "5 digits" }, { required: true, message: "Required" }]}
            normalize={(v) => (v || "").replace(/\D/g, "").slice(0, 5)}
            style={{ width: 180 }}
          >
            <Input placeholder="e.g. 23100" style={{ fontFamily: "monospace" }} />
          </Form.Item>
          <Form.Item name="inUse" valuePropName="checked">
            <Checkbox>In use (adds them to Products)</Checkbox>
          </Form.Item>
        </div>
      </Form>
      {canPreview && previewError && <Typography.Text type="danger">{previewError}</Typography.Text>}
      {shown.length > 0 && (
        <Table
          size="small"
          rowKey="sku"
          pagination={false}
          scroll={{ y: 240 }}
          dataSource={shown.map((n, i) => ({ ...n, ...variants[i] }))}
          columns={[
            { title: "SKU", dataIndex: "sku", width: 80 },
            { title: "UPC", dataIndex: "upc", width: 160, render: (v) => <span style={{ fontFamily: "monospace" }}>{formatUpc(v)}</span> },
            {
              title: "Product",
              key: "product",
              render: (_, v) => [name, v.color, v.packSize ? `${v.packSize} Pack` : null].filter(Boolean).join(" "),
            },
          ]}
        />
      )}
    </Modal>
  );
}

// One more color and/or pack size for an existing group
function AddVariantModal({ group, colorOptions, onClose, onAdded }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  async function handleOk() {
    const values = await form.validateFields();
    if (!values.color && !values.packSize) {
      message.warning("Enter a color or pack size");
      return;
    }
    setSaving(true);
    try {
      const { skus } = await upcApi.addVariant(group.groupId, values);
      message.success(`Added ${skus[0]} to ${group.groupName}`);
      onAdded();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Add to ${group?.groupName ?? ""}`}
      open={!!group}
      onCancel={onClose}
      onOk={handleOk}
      okText="Add"
      confirmLoading={saving}
      destroyOnHidden
      width={420}
    >
      <Typography.Paragraph type="secondary">
        Uses the group&apos;s product details and the next free number after the group.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ inUse: true }}>
        <Form.Item name="color" label="Color">
          <AutoComplete
            allowClear
            placeholder="e.g. Silver"
            options={colorOptions.map((c) => ({ value: c }))}
            filterOption={(input, opt) => opt.value.toLowerCase().includes(input.toLowerCase())}
          />
        </Form.Item>
        <Form.Item name="packSize" label="Pack size">
          <InputNumber min={1} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="inUse" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>In use (adds it to Products)</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

// Put ticked numbers into a new group or an existing one
function GroupSelectedModal({ skus, groups, onClose, onGrouped }) {
  const [mode, setMode] = useState("new");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleOk() {
    setSaving(true);
    try {
      const group = await upcApi.assignGroup(mode === "new" ? { skus, name } : { skus, groupId });
      message.success(`Grouped ${skus.length} number${skus.length === 1 ? "" : "s"} into ${group.name}`);
      onGrouped();
      onClose();
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Group ${skus.length} number${skus.length === 1 ? "" : "s"}`}
      open={skus.length > 0}
      onCancel={onClose}
      onOk={handleOk}
      okText="Group"
      okButtonProps={{ disabled: mode === "new" ? !name.trim() : !groupId }}
      confirmLoading={saving}
      destroyOnHidden
      width={440}
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[{ value: "new", label: "New group" }, { value: "existing", label: "Add to existing group", disabled: groups.length === 0 }]}
        style={{ marginBottom: 16 }}
      />
      {mode === "new" ? (
        <Input autoFocus placeholder="Group name, e.g. Shoe Rack" value={name} onChange={(e) => setName(e.target.value)} />
      ) : (
        <Select
          showSearch
          style={{ width: "100%" }}
          placeholder="Pick a group"
          value={groupId}
          onChange={setGroupId}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          filterOption={(input, opt) => opt.label.toLowerCase().includes(input.toLowerCase())}
        />
      )}
    </Modal>
  );
}

function OtherRangeView({ ranges }) {
  const [range, setRange] = useState(ranges[0]?.code ?? "custom");
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);
  const [savingSku, setSavingSku] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [addingTo, setAddingTo] = useState(null);
  const [selectedSkus, setSelectedSkus] = useState([]);
  const [groupingSkus, setGroupingSkus] = useState([]);
  const [barcode, setBarcode] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState([]);

  const activeRange = range === "custom" || ranges.some((r) => r.code === range) ? range : ranges[0]?.code ?? "custom";
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    setLoading(true);
    Promise.all([activeRange === "custom" ? upcApi.custom() : upcApi.list(activeRange), upcApi.groups()])
      .then(([r, g]) => { setRows(r); setGroups(g); })
      .catch((err) => message.error(err.message))
      .finally(() => setLoading(false));
  }, [activeRange, reloadKey]);

  function replaceRow(updated) {
    if (rows.some((r) => r.sku === updated.sku)) {
      setRows((prev) => prev.map((r) => (r.sku === updated.sku ? updated : r)));
    } else {
      reload(); // created outside this tab's list
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

  async function groupAction(fn, done) {
    try {
      await fn();
      if (done) message.success(done);
      reload();
    } catch (err) {
      message.error(err.message);
    }
  }

  function renameGroup(group) {
    let value = group.groupName;
    Modal.confirm({
      title: "Rename group",
      icon: null,
      content: <Input defaultValue={value} autoFocus onChange={(e) => { value = e.target.value; }} />,
      okText: "Save",
      onOk: () => groupAction(() => upcApi.renameGroup(group.groupId, value)),
    });
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const groupName = new Map(groups.map((g) => [g.id, g.name]));
    return rows.filter((r) => {
      if (status === "inUse" && !r.inUse) return false;
      if (status === "available" && (r.inUse || r.name)) return false;
      if (!term) return true;
      return [r.sku, r.upc, r.name, r.brand, r.color, r.category, r.product?.name, groupName.get(r.groupId)]
        .some((v) => v && v.toLowerCase().includes(term));
    });
  }, [rows, groups, search, status]);

  // "Available" shows every empty number individually; otherwise group them
  const tableRows = useMemo(
    () => (status === "available" ? filteredRows : groupOtherRows(filteredRows, groups)),
    [filteredRows, groups, status]
  );
  const groupKeys = tableRows.filter((r) => r.isGroup).map((r) => r.key);
  // While searching, open every matching group
  const visibleExpandedKeys = search.trim() ? groupKeys : expandedKeys;
  const colorOptions = useMemo(() => [...new Set(rows.map((r) => r.color).filter(Boolean))].sort(), [rows]);

  const dash = <span style={{ color: "#bbb" }}>—</span>;
  const stop = (e) => e.stopPropagation();
  const columns = [
    {
      title: "SKU",
      dataIndex: "sku",
      width: 130,
      render: (v, r) => {
        if (r.isAvailable) return null;
        if (r.isGroup) return <strong>{r.children[0].sku}–{r.children[r.children.length - 1].sku}</strong>;
        return <strong>{v}</strong>;
      },
    },
    {
      title: "UPC",
      dataIndex: "upc",
      width: 170,
      render: (v, r) => {
        if (r.isAvailable) {
          return (
            <span style={{ color: "#8c8c8c" }}>
              {r.count} available number{r.count === 1 ? "" : "s"} ·{" "}
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setStatus("available")}>Show</Button>
            </span>
          );
        }
        if (r.isGroup) return <span style={{ color: "#8c8c8c" }}>{r.children.length} numbers</span>;
        return <span style={{ fontFamily: "monospace" }}>{formatUpc(v)}</span>;
      },
    },
    {
      title: "Name",
      dataIndex: "name",
      render: (v, r) => (r.isAvailable ? null : r.isGroup ? <strong>{r.groupName}</strong> : v || dash),
    },
    {
      title: "Brand",
      dataIndex: "brand",
      render: (v, r) => (r.isAvailable ? null : r.isGroup ? uniqueJoin(r.children.map((c) => c.brand)) || dash : v || dash),
    },
    {
      title: "Color",
      dataIndex: "color",
      render: (v, r) => {
        if (r.isAvailable) return null;
        if (r.isGroup) {
          return <span style={{ color: "#595959", display: "inline-block", maxWidth: 260 }}>{uniqueJoin(r.children.map((c) => c.color)) || dash}</span>;
        }
        return v || dash;
      },
    },
    {
      title: "Category",
      dataIndex: "category",
      render: (v, r) => (r.isAvailable ? null : r.isGroup ? uniqueJoin(r.children.map((c) => c.category)) || dash : v || dash),
    },
    {
      title: "Pack",
      dataIndex: "packSize",
      width: 90,
      align: "right",
      render: (v, r) => {
        if (r.isAvailable) return null;
        if (r.isGroup) {
          const packs = [...new Set(r.children.map((c) => c.packSize).filter(Boolean))].sort((a, b) => a - b);
          return packs.length ? packs.join(", ") : dash;
        }
        return v || dash;
      },
    },
    {
      title: "In use",
      dataIndex: "inUse",
      width: 70,
      align: "center",
      render: (inUse, r) => {
        if (r.isAvailable) return null;
        if (r.isGroup) return <span style={{ color: "#8c8c8c" }}>{r.children.filter((c) => c.inUse).length}/{r.children.length}</span>;
        return <Checkbox checked={inUse} disabled={savingSku === r.sku} onChange={(e) => handleToggle(r, e.target.checked)} />;
      },
    },
    {
      title: "",
      key: "actions",
      width: 120,
      render: (_, r) => {
        if (r.isAvailable) return null;
        if (r.isGroup) {
          return (
            <span onClick={stop} style={{ whiteSpace: "nowrap" }}>
              <Tooltip title="Add a color or pack size"><Button type="text" icon={<PlusOutlined />} onClick={() => setAddingTo(r)} /></Tooltip>
              <Tooltip title="Rename group"><Button type="text" icon={<EditOutlined />} onClick={() => renameGroup(r)} /></Tooltip>
              <Popconfirm
                title={`Break up ${r.groupName}?`}
                description="The numbers and products stay; they just won't be grouped."
                onConfirm={() => groupAction(() => upcApi.deleteGroup(r.groupId), "Group removed")}
              >
                <Tooltip title="Ungroup all"><Button type="text" icon={<DisconnectOutlined />} /></Tooltip>
              </Popconfirm>
            </span>
          );
        }
        return (
          <span style={{ whiteSpace: "nowrap" }}>
            <Tooltip title="Barcode artwork">
              <Button
                type="text"
                icon={<BarcodeOutlined />}
                onClick={() => setBarcode({ upc: r.upc, sku: r.sku, label: r.product?.name || r.name })}
              />
            </Tooltip>
            <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(r)} />
            {r.groupId && (
              <Tooltip title="Take out of group">
                <Button
                  type="text"
                  icon={<DisconnectOutlined />}
                  onClick={() => groupAction(() => upcApi.removeFromGroup(r.groupId, r.sku), `${r.sku} taken out of group`)}
                />
              </Tooltip>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Segmented
          value={activeRange}
          onChange={(v) => { setRange(v); setSelectedSkus([]); }}
          options={[
            ...ranges.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` })),
            { value: "custom", label: "Other numbers" },
          ]}
          style={{ maxWidth: "100%", overflowX: "auto" }}
        />
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setCreateGroupOpen(true)}>Create group</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Create</Button>
        </Space>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Input.Search
          placeholder="Search SKU, UPC, name, color, group"
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
        {selectedSkus.length > 0 && (
          <>
            <Button icon={<GroupOutlined />} onClick={() => setGroupingSkus(selectedSkus)}>
              Group selected ({selectedSkus.length})
            </Button>
            <Button type="link" onClick={() => setSelectedSkus([])}>Clear</Button>
          </>
        )}
        <span style={{ marginLeft: "auto", color: "#8c8c8c" }}>
          {activeRange === "custom"
            ? `${rows.length} number${rows.length === 1 ? "" : "s"} outside the named ranges`
            : `${rows.filter((r) => r.inUse).length} of 1000 in use`}
        </span>
      </div>
      <Table
        rowKey={(r) => r.key ?? r.sku}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={tableRows}
        rowSelection={{
          checkStrictly: true,
          selectedRowKeys: selectedSkus,
          onChange: (keys) => setSelectedSkus(keys.filter((k) => /^\d{5}$/.test(k))),
          getCheckboxProps: (r) => ({ disabled: !!(r.isGroup || r.isAvailable), style: r.isGroup || r.isAvailable ? { display: "none" } : undefined }),
          hideSelectAll: true,
        }}
        expandable={{
          expandedRowKeys: visibleExpandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys),
          expandRowByClick: true,
        }}
        onRow={(r) => (r.isGroup ? { style: { cursor: "pointer", background: "#fafafa" } } : {})}
        scroll={{ x: "max-content" }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ["50", "100", "200"] }}
      />
      <OtherNumberModal row={editing} onClose={() => setEditing(null)} onSaved={replaceRow} />
      {barcode && <BarcodeModal {...barcode} onClose={() => setBarcode(null)} />}
      <CreateNumberModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onContinue={(row) => { setCreateOpen(false); setEditing(row); }}
      />
      <CreateGroupModal
        open={createGroupOpen}
        range={activeRange}
        colorOptions={colorOptions}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={reload}
      />
      <AddVariantModal group={addingTo} colorOptions={colorOptions} onClose={() => setAddingTo(null)} onAdded={reload} />
      <GroupSelectedModal
        skus={groupingSkus}
        groups={groups}
        onClose={() => setGroupingSkus([])}
        onGrouped={() => setSelectedSkus([])}
      />
    </>
  );
}

export default function Upc() {
  const [section, setSection] = useState("travel");
  const [barcode, setBarcode] = useState(null);
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
    {
      title: "",
      key: "barcode",
      width: 48,
      render: (_, r) => (
        <Tooltip title="Barcode artwork">
          <Button
            type="text"
            icon={<BarcodeOutlined />}
            onClick={() => setBarcode({
              upc: r.upc, sku: r.sku,
              label: r.product?.name || [r.brandName, r.styleName, r.colorName].filter(Boolean).join(" "),
            })}
          />
        </Tooltip>
      ),
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

      {barcode && <BarcodeModal {...barcode} onClose={() => setBarcode(null)} />}

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

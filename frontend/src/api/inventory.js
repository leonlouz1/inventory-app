import { apiClient } from "./client";

export const productsApi = {
  list: () => apiClient.get("/products"),
  create: (data) => apiClient.post("/products", data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  delete: (id) => apiClient.delete(`/products/${id}`),
  updateStock: (id, stock) => apiClient.put(`/products/${id}/stock`, { stock }),
  bulkUpdateStock: (rows) => apiClient.post("/products/bulk-stock", rows),
  projection: (id) => apiClient.get(`/products/${id}/projection`),
  full: (id) => apiClient.get(`/products/${id}/full`),
  bySku: (sku) => apiClient.get(`/products/by-sku/${encodeURIComponent(sku)}`),
  setShadowParent: (id, parentId) => apiClient.put(`/products/${id}/shadow-parent`, { parentId }),
  setShadows: (id, shadowIds) => apiClient.put(`/products/${id}/shadows`, { shadowIds }),
};

export const ordersApi = {
  list: () => apiClient.get("/orders"),
  get: (id) => apiClient.get(`/orders/${id}`),
  create: (data) => apiClient.post("/orders", data),
  delete: (id) => apiClient.delete(`/orders/${id}`),
  addLine: (orderId, data) => apiClient.post(`/orders/${orderId}/lines`, data),
  updateLine: (orderId, lineId, data) => apiClient.put(`/orders/${orderId}/lines/${lineId}`, data),
  deleteLine: (orderId, lineId) => apiClient.delete(`/orders/${orderId}/lines/${lineId}`),
  updateStatus: (id, status) => apiClient.put(`/orders/${id}/status`, { status }),
  updateNotes: (id, notes) => apiClient.patch(`/orders/${id}/notes`, { notes }),
  updateCustomerPo: (id, customerPo) => apiClient.patch(`/orders/${id}/customer-po`, { customerPo }),
  updateCustomer: (id, customer) => apiClient.patch(`/orders/${id}/customer`, { customer }),
  renameCustomer: (oldName, newName) => apiClient.patch(`/orders/rename-customer`, { oldName, newName }),
  updateLineContainer: (orderId, lineId, containerNumber) => apiClient.patch(`/orders/${orderId}/lines/${lineId}/container`, { containerNumber }),
  updateShippedAt: (id, shippedAt) => apiClient.patch(`/orders/${id}/shipped-at`, { shippedAt }),
  updateLineCartonMarking: (orderId, lineId, cartonMarking) => apiClient.patch(`/orders/${orderId}/lines/${lineId}/carton-marking`, { cartonMarking }),
  assignWarehouse: (id, warehouseId) => apiClient.patch(`/orders/${id}/warehouse`, { warehouseId }),
  nextNumber: () => apiClient.get("/orders/next-number"),
  assignShadows: (orderIds) => apiClient.post("/orders/assign-shadows", { orderIds }),
  split: (id, lines, shipDate) => apiClient.post(`/orders/${id}/split`, { lines, shipDate }),
};

export const restocksApi = {
  list: () => apiClient.get("/restocks"),
  create: (data) => apiClient.post("/restocks", data),
  update: (id, data) => apiClient.put(`/restocks/${id}`, data),
  updateStatus: (id, status) => apiClient.patch(`/restocks/${id}/status`, { status }),
  delete: (id) => apiClient.delete(`/restocks/${id}`),
};

export const warehousesApi = {
  list: () => apiClient.get("/warehouses"),
  create: (data) => apiClient.post("/warehouses", data),
  update: (id, data) => apiClient.put(`/warehouses/${id}`, data),
  delete: (id) => apiClient.delete(`/warehouses/${id}`),
  transfer: (data) => apiClient.post("/warehouses/transfer", data),
};

export const emailsApi = {
  getOrderDefaults: (orderId) => apiClient.get(`/emails/order-defaults/${orderId}`),
  sendInvoice: (data) => apiClient.post("/emails/invoice", data),
  sendRouting: (data) => apiClient.post("/emails/routing", data),
};

export const timelineApi = {
  get: (sku, grain) => apiClient.get(`/timeline?sku=${encodeURIComponent(sku)}&grain=${grain}`),
  history: (sku) => apiClient.get(`/timeline/history?sku=${encodeURIComponent(sku)}`),
};

export const alertsApi = {
  list: () => apiClient.get("/alerts"),
};

export const crmApi = {
  // dashboard
  dashboard: () => apiClient.get("/crm/dashboard"),
  // retailers
  listRetailers: (archived = false) => apiClient.get(`/crm/retailers${archived ? "?archived=true" : ""}`),
  getRetailer: (id) => apiClient.get(`/crm/retailers/${id}`),
  createRetailer: (data) => apiClient.post("/crm/retailers", data),
  updateRetailer: (id, data) => apiClient.put(`/crm/retailers/${id}`, data),
  deleteRetailer: (id) => apiClient.delete(`/crm/retailers/${id}`),
  updateCategory: (retailerId, data) => apiClient.patch(`/crm/retailers/${retailerId}/categories`, data),
  archiveRetailer: (id, archived) => apiClient.patch(`/crm/retailers/${id}/archive`, { archived }),
  deleteCategory: (retailerId, category) => apiClient.delete(`/crm/retailers/${retailerId}/categories/${encodeURIComponent(category)}`),
  // contacts
  listContacts: (retailerId) => apiClient.get(`/crm/contacts${retailerId ? `?retailerId=${retailerId}` : ""}`),
  createContact: (data) => apiClient.post("/crm/contacts", data),
  updateContact: (id, data) => apiClient.put(`/crm/contacts/${id}`, data),
  deleteContact: (id) => apiClient.delete(`/crm/contacts/${id}`),
  // activity
  listActivity: (params = {}) => apiClient.get(`/crm/activity?${new URLSearchParams(params)}`),
  createActivity: (data) => apiClient.post("/crm/activity", data),
  updateActivity: (id, data) => apiClient.put(`/crm/activity/${id}`, data),
  deleteActivity: (id) => apiClient.delete(`/crm/activity/${id}`),
  // active customers (Active or Order Placed in CRM)
  activeCustomers: () => apiClient.get("/crm/active-customers"),
  // retailer types
  listRetailerTypes: () => apiClient.get("/crm/retailer-types"),
  createRetailerType: (name) => apiClient.post("/crm/retailer-types", { name }),
  updateRetailerType: (id, name) => apiClient.put(`/crm/retailer-types/${id}`, { name }),
  deleteRetailerType: (id) => apiClient.delete(`/crm/retailer-types/${id}`),
  // sent tracker
  listSent: (params = {}) => apiClient.get(`/crm/sent?${new URLSearchParams(params)}`),
  createSent: (data) => apiClient.post("/crm/sent", data),
  updateSent: (id, data) => apiClient.put(`/crm/sent/${id}`, data),
  deleteSent: (id) => apiClient.delete(`/crm/sent/${id}`),
};

export const skuGroupsApi = {
  list: () => apiClient.get("/sku-groups"),
  suggestions: () => apiClient.get("/sku-groups/suggestions"),
  create: (name) => apiClient.post("/sku-groups", { name }),
  update: (id, name) => apiClient.put(`/sku-groups/${id}`, { name }),
  delete: (id) => apiClient.delete(`/sku-groups/${id}`),
  addSku: (id, sku) => apiClient.post(`/sku-groups/${id}/skus`, { sku }),
  removeSku: (id, productId) => apiClient.delete(`/sku-groups/${id}/skus/${productId}`),
  swapLine: (orderId, lineId, productId) => apiClient.patch(`/orders/${orderId}/lines/${lineId}/swap`, { productId }),
};

export const billingApi = {
  list: () => apiClient.get("/billing"),
  markInvoiced: (id, invoiced) => apiClient.patch(`/billing/${id}/invoice`, { invoiced }),
};

export const shipmentsApi = {
  list: () => apiClient.get("/shipments"),
  get: (id) => apiClient.get(`/shipments/${id}`),
  create: (data) => apiClient.post("/shipments", data),
  update: (id, data) => apiClient.put(`/shipments/${id}`, data),
  delete: (id) => apiClient.delete(`/shipments/${id}`),
  addOrder: (shipmentId, orderId) => apiClient.post(`/shipments/${shipmentId}/orders/${orderId}`, {}),
  removeOrder: (shipmentId, orderId) => apiClient.delete(`/shipments/${shipmentId}/orders/${orderId}`),
  combine: (shipmentIds, keepId) => apiClient.post("/shipments/combine", { shipmentIds, keepId }),
  split: (id, orderIds) => apiClient.post(`/shipments/${id}/split`, { orderIds }),
  bolDefaults: (id) => apiClient.get(`/shipments/${id}/bol`),
};

export const upcApi = {
  list: (range) => apiClient.get(`/upc?range=${range}`),
  saveNumber: (sku, data) => apiClient.patch(`/upc/${sku}`, data),
  number: (sku) => apiClient.get(`/upc/number/${sku}`),
  custom: () => apiClient.get("/upc/custom"),
  groups: () => apiClient.get("/upc/groups"),
  nextFree: (from, count) => apiClient.get(`/upc/next-free?from=${from}&count=${count}`),
  createGroup: (data) => apiClient.post("/upc/groups", data),
  addVariant: (groupId, data) => apiClient.post(`/upc/groups/${groupId}/variants`, data),
  assignGroup: (data) => apiClient.post("/upc/groups/assign", data),
  renameGroup: (groupId, name) => apiClient.put(`/upc/groups/${groupId}`, { name }),
  removeFromGroup: (groupId, sku) => apiClient.delete(`/upc/groups/${groupId}/members/${sku}`),
  deleteGroup: (groupId) => apiClient.delete(`/upc/groups/${groupId}`),
  grid: () => apiClient.get("/upc/grid"),
  setInUse: (sku, inUse) => apiClient.patch(`/upc/${sku}`, { inUse }),
  codes: () => apiClient.get("/upc/codes"),
  addCode: (kind, code, name) => apiClient.post("/upc/codes", { kind, code, name }),
  renameCode: (id, name) => apiClient.put(`/upc/codes/${id}`, { name }),
  deleteCode: (id) => apiClient.delete(`/upc/codes/${id}`),
};

export const productFieldsApi = {
  list: () => apiClient.get("/product-fields"),
  addOption: (key, value) => apiClient.post(`/product-fields/${encodeURIComponent(key)}/options`, { value }),
};

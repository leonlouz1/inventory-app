import { apiClient } from "./client";

export const productsApi = {
  list: () => apiClient.get("/products"),
  create: (data) => apiClient.post("/products", data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  delete: (id) => apiClient.delete(`/products/${id}`),
  updateStock: (id, stock) => apiClient.put(`/products/${id}/stock`, { stock }),
  projection: (id) => apiClient.get(`/products/${id}/projection`),
};

export const ordersApi = {
  list: () => apiClient.get("/orders"),
  get: (id) => apiClient.get(`/orders/${id}`),
  create: (data) => apiClient.post("/orders", data),
  delete: (id) => apiClient.delete(`/orders/${id}`),
  addLine: (orderId, data) => apiClient.post(`/orders/${orderId}/lines`, data),
  updateLine: (orderId, lineId, data) => apiClient.put(`/orders/${orderId}/lines/${lineId}`, data),
  updateStatus: (id, status) => apiClient.put(`/orders/${id}/status`, { status }),
  updateNotes: (id, notes) => apiClient.patch(`/orders/${id}/notes`, { notes }),
  nextNumber: () => apiClient.get("/orders/next-number"),
};

export const restocksApi = {
  list: () => apiClient.get("/restocks"),
  create: (data) => apiClient.post("/restocks", data),
  update: (id, data) => apiClient.put(`/restocks/${id}`, data),
  delete: (id) => apiClient.delete(`/restocks/${id}`),
};

export const warehousesApi = {
  list: () => apiClient.get("/warehouses"),
  create: (data) => apiClient.post("/warehouses", data),
  update: (id, data) => apiClient.put(`/warehouses/${id}`, data),
  delete: (id) => apiClient.delete(`/warehouses/${id}`),
  transfer: (data) => apiClient.post("/warehouses/transfer", data),
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
  listRetailers: () => apiClient.get("/crm/retailers"),
  getRetailer: (id) => apiClient.get(`/crm/retailers/${id}`),
  createRetailer: (data) => apiClient.post("/crm/retailers", data),
  updateRetailer: (id, data) => apiClient.put(`/crm/retailers/${id}`, data),
  deleteRetailer: (id) => apiClient.delete(`/crm/retailers/${id}`),
  updateCategory: (retailerId, data) => apiClient.patch(`/crm/retailers/${retailerId}/categories`, data),
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

export const shipmentsApi = {
  list: () => apiClient.get("/shipments"),
  create: (data) => apiClient.post("/shipments", data),
  update: (id, data) => apiClient.put(`/shipments/${id}`, data),
  delete: (id) => apiClient.delete(`/shipments/${id}`),
  addOrder: (shipmentId, orderId) => apiClient.post(`/shipments/${shipmentId}/orders/${orderId}`, {}),
  removeOrder: (shipmentId, orderId) => apiClient.delete(`/shipments/${shipmentId}/orders/${orderId}`),
};

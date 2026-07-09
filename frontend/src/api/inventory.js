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

export const shipmentsApi = {
  list: () => apiClient.get("/shipments"),
  create: (data) => apiClient.post("/shipments", data),
  update: (id, data) => apiClient.put(`/shipments/${id}`, data),
  delete: (id) => apiClient.delete(`/shipments/${id}`),
  addOrder: (shipmentId, orderId) => apiClient.post(`/shipments/${shipmentId}/orders/${orderId}`, {}),
  removeOrder: (shipmentId, orderId) => apiClient.delete(`/shipments/${shipmentId}/orders/${orderId}`),
};

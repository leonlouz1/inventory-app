import { apiClient } from "./client";

export const productsApi = {
  list: () => apiClient.get("/products"),
  create: (data) => apiClient.post("/products", data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  delete: (id) => apiClient.delete(`/products/${id}`),
  projection: (id) => apiClient.get(`/products/${id}/projection`),
};

export const ordersApi = {
  list: () => apiClient.get("/orders"),
  get: (id) => apiClient.get(`/orders/${id}`),
  create: (data) => apiClient.post("/orders", data),
  delete: (id) => apiClient.delete(`/orders/${id}`),
  updateLine: (orderId, lineId, data) => apiClient.put(`/orders/${orderId}/lines/${lineId}`, data),
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
};

export const timelineApi = {
  get: (sku, grain) => apiClient.get(`/timeline?sku=${encodeURIComponent(sku)}&grain=${grain}`),
};

export const alertsApi = {
  list: () => apiClient.get("/alerts"),
};

import { apiClient } from "./client";

export const catalogApi = {
  list: () => apiClient.get("/catalog"),
  get: (sku) => apiClient.get(`/catalog/${sku}`),
  update: (id, data) => apiClient.patch(`/catalog/${id}`, data),
  availableToSell: () => apiClient.get("/catalog/report/available-to-sell"),
};

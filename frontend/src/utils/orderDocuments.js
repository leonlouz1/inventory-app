import { authHeaders } from "../api/client";
import { orderDocumentsApi } from "../api/inventory";

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Couldn't read the file"));
    reader.readAsDataURL(file);
  });
}

// Keeps a file on an order. kind: PO, SIGNED_BOL, ... (constants/documentKinds)
export async function uploadOrderDocument(orderId, file, kind = "OTHER") {
  if (file.size > 15 * 1024 * 1024) throw new Error("File is too large (15 MB max)");
  return orderDocumentsApi.upload({
    orderId,
    filename: file.name,
    kind,
    contentType: file.type || "application/octet-stream",
    data: await toBase64(file),
  });
}

// The stored file as a Blob (the download needs the sign-in token)
export async function fetchOrderDocument(doc) {
  const res = await fetch(`${API_BASE}/order-documents/${doc.id}/file`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Couldn't load ${doc.filename}`);
  return new File([await res.blob()], doc.filename, { type: doc.contentType });
}

export function saveFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

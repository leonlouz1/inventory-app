import { authHeaders } from "../api/client";

const API_BASE = `${import.meta.env.VITE_API_URL || ""}/api`;

// A picked file as { filename, contentType, data: base64 } for the API
export function fileToUpload(file) {
  if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error("File is too large (15 MB max)"));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      data: String(reader.result).split(",")[1] || "",
    });
    reader.onerror = () => reject(new Error("Couldn't read the file"));
    reader.readAsDataURL(file);
  });
}

// Opens a file kept on a history entry in a new tab (the download needs the sign-in token)
export async function openCrmAttachment(att) {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`${API_BASE}/crm/attachments/${att.id}/file`, { headers: await authHeaders() });
    if (!res.ok) throw new Error(`Couldn't load ${att.filename}`);
    const url = URL.createObjectURL(new File([await res.blob()], att.filename, { type: att.contentType }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

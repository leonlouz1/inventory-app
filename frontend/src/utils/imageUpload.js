import { imagesApi } from "../api/inventory";

// Shrink a photo in the browser (longest side 1000px, JPEG) before uploading,
// so stored images stay small. With productId it becomes the product's image.
// Returns { id, url }.
export async function uploadProductImage(file, productId) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return imagesApi.upload({ data: dataUrl.split(",")[1], contentType: "image/jpeg", productId });
}

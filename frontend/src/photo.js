// Decode locally, then re-encode a bounded raster; never persist the original file.
export async function compressPhoto(file, maxSize = 400) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxSize / image.naturalWidth, maxSize / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.85);
    if (result.length > (maxSize > 400 ? 1200000 : 700000)) throw new Error("This photo is too large. Choose a smaller image.");
    return result;
  } catch (error) {
    throw new Error(error.name === "EncodingError" ? "This image could not be opened. Choose another photo." : error.message);
  } finally { URL.revokeObjectURL(url); }
}

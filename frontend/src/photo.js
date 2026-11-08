// Decode locally, then re-encode a bounded raster; never persist the original file.
export async function compressPhoto(file, maxSize = 720) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    maxSize = Math.min(maxSize, 720);
    const scale = Math.min(1, maxSize / image.naturalWidth, maxSize / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Keep the entire base64 JSON field below 120 KB, not merely the JPEG bytes.
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = canvas.toDataURL("image/jpeg", 0.75);
      if (result.length < 120000) return result;
      canvas.width = Math.max(1, Math.floor(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.floor(canvas.height * 0.8));
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    throw new Error("This photo could not be compressed below 120 KB. Choose a smaller image.");
  } catch (error) {
    throw new Error(error.name === "EncodingError" ? "This image could not be opened. Choose another photo." : error.message);
  } finally { URL.revokeObjectURL(url); }
}

// Recompress pre-rollout inline avatars when their owner next edits the profile.
export async function compressStoredPhoto(value) {
  if (!value?.startsWith('data:') || value.length < 120000) return value;
  const [header, encoded] = value.split(',');
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  return compressPhoto(new Blob([bytes], { type: header.slice(5).split(';')[0] }));
}

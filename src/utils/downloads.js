export function pdfFilename(sku, index) {
  const safe = String(sku || "SKU").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80);
  return `${String(index + 1).padStart(5, "0")}_${safe}.pdf`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser consume the URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

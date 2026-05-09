export const CUSTOM_IMAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export const CUSTOM_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function detectImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = Number(img.naturalWidth || 0);
      const height = Number(img.naturalHeight || 0);
      URL.revokeObjectURL(objectUrl);
      if (!width || !height) {
        reject(new Error(`No pudimos leer dimensiones de ${file.name || 'imagen'}`));
        return;
      }
      resolve({ width, height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Archivo inválido o corrupto: ${file.name || 'imagen'}`));
    };

    img.src = objectUrl;
  });
}

// Préparation d'une image choisie par l'utilisateur, avant son envoi au backend (POST /api/uploads) :
// réduite dans le navigateur à 1600 px de côté en JPEG, pour épargner les connexions lentes.
// Le backend la ré-encode ensuite en WebP et l'enregistre comme fichier.
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Impossible de lire l'image « ${file.name} »`));
    };
    img.src = url;
  });
}

export async function resizeImageFile(file: File): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error('Formats acceptés : PNG, JPEG ou WebP');
  }

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return file; // pas de canvas : le backend réduira l'original
  // Fond blanc : les PNG transparents deviendraient noirs en JPEG
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  return blob ?? file;
}

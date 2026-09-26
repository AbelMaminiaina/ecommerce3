import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, requireApprovedCompany } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { InvalidImageError, MAX_UPLOAD_BYTES, saveImage } from '../lib/uploads.js';

// Téléversement d'une image de produit : le fichier est traité puis enregistré sur disque,
// la réponse contient l'URL à placer dans `images` du produit.
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

// Administrateur de la plateforme ou entreprise approuvée (vendeur)
function requireUploader(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'platform_admin') return next();
  return requireApprovedCompany(req, res, next);
}

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Trop d’images envoyées, réessayez dans quelques minutes.',
});

// Réception du champ `image` ; les erreurs de multer (fichier trop lourd…) deviennent des 400 lisibles
function receiveImage(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image trop lourde (8 Mo maximum)' : 'Envoi du fichier invalide';
      return res.status(400).json({ error: message });
    }
    if (error) return next(error);
    next();
  });
}

router.post('/', uploadLimiter, authenticate, requireUploader, receiveImage, async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucune image reçue' });
  }
  try {
    const url = await saveImage(req.file.buffer);
    res.status(201).json({ url });
  } catch (error) {
    if (error instanceof InvalidImageError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error saving uploaded image:', error);
    res.status(500).json({ error: "Impossible d'enregistrer l'image" });
  }
});

export default router;

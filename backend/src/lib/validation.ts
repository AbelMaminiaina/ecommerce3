import type { Response } from 'express';
import { z } from 'zod';

// Réponse 400 commune aux routes : le message de la première erreur de validation.
// Usage : `schema.parse(req.body)` dans le try, puis dans le catch :
//   if (error instanceof z.ZodError) return sendValidationError(res, error);
export function sendValidationError(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: error.errors[0]?.message ?? 'Données invalides' });
}

// Option de `schema.parse` : toute erreur du schéma renvoie ce message unique
export const singleMessage = (message: string) => ({ errorMap: () => ({ message }) });

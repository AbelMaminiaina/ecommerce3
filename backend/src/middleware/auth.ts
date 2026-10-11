import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../lib/auth.js';
import prisma from '../lib/prisma.js';
import { resolveSessionUser } from '../lib/sessionUser.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Vérifie le JWT et attache req.user. À utiliser en premier sur toute route protégée.
// Rôle et entreprise sont relus en base (resolveSessionUser) : un compte supprimé perd l'accès tout de suite.
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  try {
    const user = await resolveSessionUser(payload);
    if (!user) {
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    }
    req.user = user;
  } catch (error) {
    console.error('Error checking session user:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
  next();
}

// À chaîner après authenticate. Réserve la route au staff plateforme.
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'platform_admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

// À chaîner après authenticate. Réserve la route aux utilisateurs d'une entreprise approuvée.
// Le statut est relu en base (pas depuis le JWT) pour refléter immédiatement une suspension/approbation.
export async function requireApprovedCompany(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.companyId) {
    return res.status(403).json({ error: 'Compte non rattaché à une entreprise' });
  }

  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (!company || company.status !== 'approved') {
      return res.status(403).json({ error: "Compte entreprise non approuvé par l'administrateur" });
    }
    next();
  } catch (error) {
    console.error('Error checking company status:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// À chaîner après authenticate. Autorise à commander : un particulier (rôle customer)
// ou un utilisateur d'une entreprise approuvée.
export async function requireCanOrder(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'customer') {
    return next();
  }
  return requireApprovedCompany(req, res, next);
}

// Comme `authenticate`, mais sans exiger de jeton : sans en-tête Authorization la requête continue
// comme visiteur (commande sans compte). Un jeton présent mais invalide reste refusé.
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

// Visiteur (sans compte) : autorisé à commander ; connecté : mêmes règles que requireCanOrder.
export async function canOrderOrGuest(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next();
  return requireCanOrder(req, res, next);
}

import { createHash, randomBytes } from 'node:crypto';
import prisma from './prisma.js';

// Jetons de renouvellement de session (application mobile). Le jeton d'accès (JWT, 7 jours) sert aux appels ;
// quand il expire, l'application en obtient un nouveau avec ce jeton de renouvellement, sans redemander le mot
// de passe. Seule l'empreinte SHA-256 est stockée : une fuite de la base ne donne aucun jeton utilisable.

const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_DAYS) || 60;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      tokenHash: hash(token),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export type RotationResult =
  | { ok: true; userId: string; refreshToken: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' };

// Échange un jeton contre un nouveau (rotation) : l'ancien est révoqué.
// Un jeton déjà utilisé qui revient signale un vol probable : toutes les sessions de l'utilisateur sont révoquées.
export async function rotateRefreshToken(token: string): Promise<RotationResult> {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!stored) return { ok: false, reason: 'invalid' };

  if (stored.revokedAt) {
    await revokeAllRefreshTokens(stored.userId);
    return { ok: false, reason: 'reused' };
  }
  if (stored.expiresAt <= new Date()) return { ok: false, reason: 'expired' };

  // Révocation conditionnelle : si deux renouvellements arrivent en même temps, un seul réussit
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: 'reused' };

  return { ok: true, userId: stored.userId, refreshToken: await issueRefreshToken(stored.userId) };
}

// Déconnexion d'un appareil
export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Déconnexion de tous les appareils (vol suspecté, suppression du compte)
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import type { UserRole } from '@prisma/client';

// En production, un secret absent ou court rendrait les jetons falsifiables : on refuse de démarrer
if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET?.length ?? 0) < 32) {
  throw new Error('JWT_SECRET est obligatoire en production (32 caractères minimum, ex. : openssl rand -hex 32)');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Site web (NextAuth) : il ne sait pas renouveler le jeton, qui dure donc 7 jours
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// Application mobile : jeton court, renouvelé automatiquement avec le jeton de renouvellement (POST /api/auth/refresh).
// Un jeton volé n'est utilisable que pendant cette durée.
export const MOBILE_ACCESS_TOKEN_TTL = process.env.MOBILE_ACCESS_TOKEN_TTL || '1h';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  companyId: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload, expiresIn: string = JWT_EXPIRES_IN): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn, algorithm: 'HS256' } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  // Algorithme imposé : un jeton signé autrement (ou « none ») est refusé
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
}

// Empreinte d'un secret court (code SMS à 6 chiffres) : la clé du serveur empêche de retrouver le code
// à partir d'une copie de la base, ce qu'un simple SHA-256 permettrait en essayant le million de valeurs
export function keyedHash(value: string): string {
  return createHmac('sha256', JWT_SECRET).update(value).digest('hex');
}

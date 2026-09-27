import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';

// En production, un secret absent rendrait tous les jetons falsifiables : on refuse de démarrer
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET est obligatoire en production');
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
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

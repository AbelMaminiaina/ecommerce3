import { randomInt, timingSafeEqual } from 'node:crypto';
import prisma from './prisma.js';
import { keyedHash } from './auth.js';

// Codes de connexion à 6 chiffres envoyés par SMS. Seule l'empreinte (HMAC avec la clé du serveur) est stockée ;
// un code expire au bout de CODE_TTL_MS et ne supporte que MAX_ATTEMPTS essais erronés (contre l'essai des
// 1 000 000 de combinaisons). Un nouveau code annule le précédent.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

const hashCode = (phone: string, code: string) => keyedHash(`${phone}:${code}`);

export type CreateCodeResult = { ok: true; code: string } | { ok: false; retryAfter: number };

// Nouveau code pour ce numéro (format local 0341234567) ; refusé si le précédent a moins d'une minute
export async function createPhoneCode(phone: string, now = new Date()): Promise<CreateCodeResult> {
  const last = await prisma.phoneCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
  if (last && now.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false, retryAfter: Math.ceil((last.createdAt.getTime() + RESEND_COOLDOWN_MS - now.getTime()) / 1000) };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await prisma.$transaction([
    // Ancien code de ce numéro, et au passage les codes expirés de tous les numéros
    prisma.phoneCode.deleteMany({ where: { OR: [{ phone }, { expiresAt: { lt: now } }] } }),
    prisma.phoneCode.create({
      data: { phone, codeHash: hashCode(phone, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
    }),
  ]);
  return { ok: true, code };
}

export type CheckCodeResult = 'ok' | 'invalid' | 'expired';

/**
 * Vérifie le code saisi. `consume` : un code juste est supprimé (usage unique) ; sans `consume`, il reste valable
 * (le site demande alors le prénom et le nom d'un nouveau client, puis renvoie le même code).
 */
export async function checkPhoneCode(
  phone: string,
  code: string,
  { consume = true, now = new Date() }: { consume?: boolean; now?: Date } = {}
): Promise<CheckCodeResult> {
  const entry = await prisma.phoneCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
  if (!entry || entry.expiresAt <= now || entry.attempts >= MAX_ATTEMPTS) return 'expired';

  const expected = Buffer.from(entry.codeHash, 'hex');
  const given = Buffer.from(hashCode(phone, code), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await prisma.phoneCode.update({ where: { id: entry.id }, data: { attempts: { increment: 1 } } });
    return entry.attempts + 1 >= MAX_ATTEMPTS ? 'expired' : 'invalid';
  }

  if (consume) await prisma.phoneCode.deleteMany({ where: { phone } });
  return 'ok';
}

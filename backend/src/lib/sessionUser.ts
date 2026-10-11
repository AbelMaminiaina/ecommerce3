import prisma from './prisma.js';
import type { JwtPayload } from './auth.js';

// Un jeton du site reste valable 7 jours : le compte est relu en base à chaque requête pour qu'une
// suppression de compte ou un changement de rôle / d'entreprise s'applique immédiatement.
// Retourne null si le compte n'existe plus (la session est alors refusée).
export async function resolveSessionUser(payload: JwtPayload): Promise<JwtPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, companyId: true, deletedAt: true },
  });
  if (!user || user.deletedAt) return null;
  return { userId: payload.userId, role: user.role, companyId: user.companyId };
}

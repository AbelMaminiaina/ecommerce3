import { vi } from 'vitest';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Les tests de routes simulent Prisma et signent leurs propres jetons : par défaut, le compte d'un jeton
// est considéré comme existant, avec le rôle du jeton. La relecture en base est testée dans
// middleware/auth.test.ts (vi.unmock).
vi.mock('../lib/sessionUser.js', () => ({
  resolveSessionUser: vi.fn(async (payload: unknown) => payload),
}));

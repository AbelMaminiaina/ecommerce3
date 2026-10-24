import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('../lib/cache.js', () => ({ invalidateProductCache: vi.fn().mockResolvedValue(undefined) }));

import prisma from '../lib/prisma.js';
import { signToken, verifyToken } from '../lib/auth.js';
import authRouter from './auth.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// Codes SMS en mémoire : le vrai lib/phoneCodes.ts tourne sur ce faux stockage
let codes: any[] = [];
let seq = 0;

function installPhoneCodeStore() {
  codes = [];
  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    if (where.OR) return where.OR.some((w: any) => matches(row, w));
    if (where.phone && row.phone !== where.phone) return false;
    if (where.expiresAt?.lt && !(row.expiresAt < where.expiresAt.lt)) return false;
    return true;
  };
  prismaMock.phoneCode.findFirst.mockImplementation((async ({ where }: any) => {
    const row = codes.filter((c) => matches(c, where)).sort((a, b) => b.createdAt - a.createdAt)[0];
    // Copie, comme Prisma : la ligne lue ne change pas quand la base est modifiée ensuite
    return row ? { ...row } : null;
  }) as any);
  prismaMock.phoneCode.create.mockImplementation((async ({ data }: any) => {
    const row = { id: `c${++seq}`, attempts: 0, createdAt: new Date(), ...data };
    codes.push(row);
    return row;
  }) as any);
  prismaMock.phoneCode.deleteMany.mockImplementation((async ({ where }: any) => {
    const before = codes.length;
    codes = codes.filter((c) => !matches(c, where));
    return { count: before - codes.length };
  }) as any);
  prismaMock.phoneCode.update.mockImplementation((async ({ where }: any) => {
    const row = codes.find((c) => c.id === where.id);
    row.attempts += 1;
    return row;
  }) as any);
}

// Chaque test a sa propre adresse IP et son propre numéro : les limiteurs sont partagés par le module
let n = 0;
let ip = '';
let phone = '';

function buildApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  request(buildApp()).post(`/api/auth${path}`).set('X-Forwarded-For', ip).set(headers).send(body);

async function requestCode(number = phone): Promise<string> {
  const res = await post('/phone/request-code', { phone: number });
  expect(res.status).toBe(200);
  return res.body.demoCode;
}

function userRow(overrides: Partial<any> = {}) {
  return {
    id: 'u1',
    email: null,
    passwordHash: 'x',
    firstName: 'Voahangy',
    lastName: 'Rasoa',
    phone,
    verifiedPhone: phone,
    role: 'customer',
    companyId: null,
    deletedAt: null,
    company: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  mockReset(prismaMock);
  installPhoneCodeStore();
  prismaMock.$transaction.mockImplementation(((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock))) as any);
  prismaMock.refreshToken.create.mockResolvedValue({} as any);
  n += 1;
  ip = `10.1.0.${n}`;
  phone = `034${String(1000000 + n).slice(-7)}`;
  // Mode démonstration : aucun SMS envoyé, le code est renvoyé dans la réponse
  vi.stubEnv('SMS_PROVIDER', 'demo');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/auth/phone', () => {
  it('indique si la connexion par SMS est disponible', async () => {
    const res = await request(buildApp()).get('/api/auth/phone');
    expect(res.body).toEqual({ enabled: true, demo: true });
  });

  it('est indisponible en production sans prestataire configuré', async () => {
    vi.stubEnv('SMS_PROVIDER', '');
    vi.stubEnv('NODE_ENV', 'production');

    const res = await request(buildApp()).get('/api/auth/phone');
    expect(res.body.enabled).toBe(false);

    const send = await post('/phone/request-code', { phone });
    expect(send.status).toBe(503);
  });
});

describe('POST /api/auth/phone/request-code', () => {
  it('refuse un numéro qui n’est pas un mobile malgache', async () => {
    const res = await post('/phone/request-code', { phone: '0201234567' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mobile malgache/);
  });

  it('enregistre seulement l’empreinte du code, au format local', async () => {
    const code = await requestCode(`+261 ${phone.slice(1, 3)} ${phone.slice(3)}`);

    expect(code).toMatch(/^\d{6}$/);
    expect(codes).toHaveLength(1);
    expect(codes[0].phone).toBe(phone);
    expect(codes[0].codeHash).not.toContain(code);
  });

  it('impose une minute d’attente avant un nouveau code', async () => {
    await requestCode();
    const res = await post('/phone/request-code', { phone });

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('ne renvoie jamais le code hors mode démonstration', async () => {
    vi.stubEnv('SMS_PROVIDER', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC1');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok');
    vi.stubEnv('TWILIO_FROM', '+15550000000');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"sid":"SM1"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await post('/phone/request-code', { phone });

    expect(res.status).toBe(200);
    expect(res.body.demoCode).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('signale un SMS refusé par le prestataire', async () => {
    vi.stubEnv('SMS_PROVIDER', 'twilio');
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC1');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok');
    vi.stubEnv('TWILIO_FROM', '+15550000000');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"no credit"}', { status: 400 })));

    const res = await post('/phone/request-code', { phone });

    expect(res.status).toBe(502);
    vi.unstubAllGlobals();
  });
});

describe('POST /api/auth/phone/verify', () => {
  it('connecte un client existant avec le bon code (usage unique)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow());
    const code = await requestCode();

    const res = await post('/phone/verify', { phone, code });

    expect(res.status).toBe(200);
    expect(verifyToken(res.body.token).userId).toBe('u1');
    expect(res.body.user).toMatchObject({ phone, email: null });
    expect(codes).toHaveLength(0);

    const again = await post('/phone/verify', { phone, code });
    expect(again.status).toBe(401);
  });

  it('refuse un mauvais code, puis invalide le code après 5 erreurs', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow());
    const code = await requestCode();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i++) {
      const res = await post('/phone/verify', { phone, code: wrong });
      expect(res.body.error).toBe('Code incorrect');
    }
    const fifth = await post('/phone/verify', { phone, code: wrong });
    expect(fifth.body.error).toMatch(/expiré/);

    const right = await post('/phone/verify', { phone, code });
    expect(right.status).toBe(401);
  });

  it('demande le nom d’un nouveau client sans consommer le code, puis crée son compte', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation((async ({ data }: any) => userRow({ ...data, id: 'u-new' })) as any);
    const code = await requestCode();

    const first = await post('/phone/verify', { phone, code });
    expect(first.body).toEqual({ success: true, needsProfile: true });
    expect(prismaMock.user.create).not.toHaveBeenCalled();

    const second = await post('/phone/verify', { phone, code, firstName: 'Voahangy', lastName: 'Rasoa', client: 'mobile' });

    expect(second.status).toBe(200);
    expect(second.body.refreshToken).toBeTruthy();
    const data = (prismaMock.user.create.mock.calls[0][0] as any).data;
    expect(data).toMatchObject({ verifiedPhone: phone, phone, firstName: 'Voahangy', role: 'customer' });
    expect(data.email).toBeUndefined();
  });

  it('ne reconnecte pas un compte supprimé : un nouveau compte est demandé', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ deletedAt: new Date() }));
    const code = await requestCode();

    const res = await post('/phone/verify', { phone, code });
    expect(res.body.needsProfile).toBe(true);
  });
});

describe('POST /api/auth/phone/link', () => {
  const auth = () => ({ Authorization: `Bearer ${signToken({ userId: 'u1', role: 'customer', companyId: null })}` });

  it('ajoute le numéro vérifié à un compte créé par e-mail', async () => {
    prismaMock.user.findUnique.mockImplementation((async ({ where }: any) =>
      where.verifiedPhone ? null : userRow({ email: 'voahangy@exemple.mg', verifiedPhone: null, phone: null })) as any);
    const code = await requestCode();

    const res = await post('/phone/link', { phone, code }, auth());

    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { verifiedPhone: phone, phone } });
  });

  it('refuse un numéro déjà utilisé par un autre compte', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow({ id: 'autre' }));
    const code = await requestCode();

    const res = await post('/phone/link', { phone, code }, auth());

    expect(res.status).toBe(409);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/auth/me avec un code SMS', () => {
  it('supprime un compte créé par téléphone et efface son numéro', async () => {
    prismaMock.user.findUnique.mockResolvedValue(userRow());
    const code = await requestCode();
    const token = signToken({ userId: 'u1', role: 'customer', companyId: null });

    const res = await request(buildApp())
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });

    expect(res.status).toBe(204);
    expect((prismaMock.user.update.mock.calls[0][0] as any).data).toMatchObject({ verifiedPhone: null, phone: null });
  });
});

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken } from './auth.js';
import { escapeHtml, escapeHtmlDeep } from '../services/emailService.js';

describe('jetons de session', () => {
  const payload = { userId: 'u1', role: 'buyer' as const, companyId: 'c1' };

  it('accepte un jeton signé par le serveur', () => {
    expect(verifyToken(signToken(payload))).toMatchObject(payload);
  });

  it('refuse un jeton non signé (algorithme « none ») ou signé avec un autre secret', () => {
    const unsigned = jwt.sign({ ...payload, role: 'platform_admin' }, '', { algorithm: 'none' });
    expect(() => verifyToken(unsigned)).toThrow();
    const forged = jwt.sign({ ...payload, role: 'platform_admin' }, 'autre-secret', { algorithm: 'HS256' });
    expect(() => verifyToken(forged)).toThrow();
  });
});

describe('échappement HTML des e-mails', () => {
  it('neutralise les balises et les guillemets', () => {
    expect(escapeHtml(`<a href="https://pirate.example">Rakoto</a> & 'co'`)).toBe(
      '&lt;a href=&quot;https://pirate.example&quot;&gt;Rakoto&lt;/a&gt; &amp; &#39;co&#39;'
    );
  });

  it('échappe toutes les chaînes d’un objet sans toucher aux nombres ni aux dates', () => {
    const date = new Date('2026-10-10T10:00:00Z');
    const escaped = escapeHtmlDeep({
      companyName: '<b>X</b>',
      total: 1000,
      createdAt: date,
      items: [{ name: '<script>', quantity: 2 }],
      address: null,
    });
    expect(escaped).toEqual({
      companyName: '&lt;b&gt;X&lt;/b&gt;',
      total: 1000,
      createdAt: date,
      items: [{ name: '&lt;script&gt;', quantity: 2 }],
      address: null,
    });
    expect(escaped.createdAt).toBeInstanceOf(Date);
  });
});

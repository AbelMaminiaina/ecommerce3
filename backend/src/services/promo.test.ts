import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../lib/prisma.js');
vi.mock('./emailService.js', () => ({ sendReferralRewardEmail: vi.fn().mockResolvedValue(true) }));
vi.mock('./smsNotifications.js', () => ({ sendReferralRewardSms: vi.fn() }));

import prisma from '../lib/prisma.js';
import { PromoError } from '../lib/promo.js';
import { sendReferralRewardEmail } from './emailService.js';
import { sendReferralRewardSms } from './smsNotifications.js';
import { claimPromo, getOrCreateReferralCode, issueReferralReward, releasePromoIfCancelled, resolvePromo } from './promo.js';

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const code = (overrides: Partial<any> = {}) =>
  ({
    id: 'pc1',
    code: 'BIENVENUE',
    kind: 'standard',
    type: 'percent',
    value: 10,
    maxDiscount: null,
    minSubtotal: 0,
    startsAt: null,
    endsAt: null,
    maxUses: 100,
    usedCount: 0,
    perUserLimit: 1,
    firstOrderOnly: false,
    isActive: true,
    ownerUserId: null,
    ...overrides,
  }) as any;

beforeEach(() => {
  mockReset(prismaMock);
  vi.mocked(sendReferralRewardEmail).mockClear();
  vi.mocked(sendReferralRewardSms).mockClear();
  prismaMock.order.count.mockResolvedValue(0);
  prismaMock.promoRedemption.count.mockResolvedValue(0);
  prismaMock.user.findUnique.mockResolvedValue({ referredById: null } as any);
});

describe('resolvePromo', () => {
  it('trouve le code quelle que soit la casse et calcule la remise', async () => {
    prismaMock.promoCode.findUnique.mockResolvedValue(code());

    const result = await resolvePromo(' bienvenue ', { userId: 'u1', companyId: null }, 50_000);

    expect(prismaMock.promoCode.findUnique).toHaveBeenCalledWith({ where: { code: 'BIENVENUE' } });
    expect(result.discount).toBe(5_000);
  });

  it('compte les commandes de l’entreprise pour « première commande »', async () => {
    prismaMock.promoCode.findUnique.mockResolvedValue(code({ firstOrderOnly: true }));
    prismaMock.order.count.mockResolvedValue(3);

    await expect(resolvePromo('BIENVENUE', { userId: 'u1', companyId: 'c1' }, 50_000)).rejects.toThrow(PromoError);
    expect((prismaMock.order.count.mock.calls[0][0] as any).where).toEqual({ status: { not: 'cancelled' }, companyId: 'c1' });
  });
});

describe('claimPromo', () => {
  it('réserve une utilisation sans dépasser la limite', async () => {
    prismaMock.promoCode.updateMany.mockResolvedValue({ count: 1 });

    await claimPromo(code(), { userId: 'u1', checkoutGroup: 'g1', discount: 5_000 });

    expect(prismaMock.promoCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'pc1', isActive: true, usedCount: { lt: 100 } },
      data: { usedCount: { increment: 1 } },
    });
    expect(prismaMock.promoRedemption.create).toHaveBeenCalledWith({
      data: { promoCodeId: 'pc1', userId: 'u1', checkoutGroup: 'g1', discountAmount: 5_000 },
    });
  });

  it('refuse quand la dernière utilisation vient d’être prise', async () => {
    prismaMock.promoCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimPromo(code(), { userId: 'u1', checkoutGroup: 'g1', discount: 5_000 })).rejects.toThrow(/entièrement utilisé/);
    expect(prismaMock.promoRedemption.create).not.toHaveBeenCalled();
  });
});

describe('releasePromoIfCancelled', () => {
  it('libère le code quand tout le panier est annulé', async () => {
    prismaMock.promoRedemption.findUnique.mockResolvedValue({ id: 'r1', promoCodeId: 'pc1', rewardIssuedAt: null } as any);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.promoRedemption.deleteMany.mockResolvedValue({ count: 1 });

    await releasePromoIfCancelled('g1');

    expect(prismaMock.promoCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'pc1', usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  });

  it('garde le code si une commande du panier reste active', async () => {
    prismaMock.promoRedemption.findUnique.mockResolvedValue({ id: 'r1', promoCodeId: 'pc1', rewardIssuedAt: null } as any);
    prismaMock.order.count.mockResolvedValue(1);

    await releasePromoIfCancelled('g1');

    expect(prismaMock.promoRedemption.deleteMany).not.toHaveBeenCalled();
  });
});

describe('parrainage', () => {
  it('crée le code personnel une seule fois', async () => {
    prismaMock.promoCode.findFirst.mockResolvedValue(null);
    prismaMock.promoCode.create.mockImplementation((async ({ data }: any) => ({ id: 'ref1', ...data })) as any);

    const created = await getOrCreateReferralCode('sponsor');

    expect(created.code).toMatch(/^TSENA-[A-HJ-NP-Z2-9]{6}$/);
    expect(created).toMatchObject({ kind: 'referral', ownerUserId: 'sponsor', type: 'percent', value: 10, firstOrderOnly: true });
  });

  it('offre un bon au parrain quand la commande du filleul est payée, une seule fois', async () => {
    const now = new Date('2026-10-25T10:00:00Z');
    prismaMock.promoRedemption.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'filleul',
      rewardIssuedAt: null,
      promoCode: { kind: 'referral', ownerUserId: 'sponsor', code: 'TSENA-ABCDEF' },
    } as any);
    prismaMock.promoRedemption.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prismaMock.user.findUnique.mockResolvedValue({ firstName: 'Hery', email: 'hery@exemple.mg', phone: null, verifiedPhone: '0331234567', deletedAt: null } as any);
    prismaMock.promoCode.create.mockImplementation((async ({ data }: any) => ({ id: 'rw1', ...data })) as any);

    await issueReferralReward('g1', now);
    await issueReferralReward('g1', now);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 'filleul', referredById: null }, data: { referredById: 'sponsor' } });
    expect(prismaMock.promoCode.create).toHaveBeenCalledOnce();
    const reward = (prismaMock.promoCode.create.mock.calls[0][0] as any).data;
    expect(reward).toMatchObject({ kind: 'reward', type: 'fixed', value: 5_000, maxUses: 1, ownerUserId: 'sponsor' });
    expect(reward.code).toMatch(/^MERCI-/);
    expect(sendReferralRewardSms).toHaveBeenCalledWith(expect.objectContaining({ phone: '0331234567', amount: 5_000 }));
    expect(sendReferralRewardEmail).toHaveBeenCalledOnce();
  });

  it('ignore un code promo classique', async () => {
    prismaMock.promoRedemption.findUnique.mockResolvedValue({ id: 'r1', rewardIssuedAt: null, promoCode: { kind: 'standard', ownerUserId: null } } as any);

    await issueReferralReward('g1');

    expect(prismaMock.promoRedemption.updateMany).not.toHaveBeenCalled();
  });
});

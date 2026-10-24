import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword, signToken, MOBILE_ACCESS_TOKEN_TTL } from '../lib/auth.js';
import { issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken } from '../lib/refreshTokens.js';
import { invalidateProductCache } from '../lib/cache.js';
import { sendValidationError, singleMessage } from '../lib/validation.js';
import { authenticate } from '../middleware/auth.js';
import { failureLimiter, rateLimit } from '../lib/rateLimit.js';
import { normalizeMalagasyMobile } from '../lib/phone.js';
import { checkPhoneCode, createPhoneCode, CODE_TTL_MS, type CheckCodeResult } from '../lib/phoneCodes.js';
import { isDemoSms, sendSms, smsEnabled } from '../lib/sms.js';
import type { Company, User } from '@prisma/client';

const router = Router();

// ---------- Limites d'essais (contre les essais de mots de passe en série) ----------
// Beaucoup d'abonnés mobiles partagent une même adresse IP chez leur opérateur : la limite stricte porte sur
// le couple IP + e-mail visé, la limite par IP seule est large (elle ne freine que les attaques de masse).
const QUARTER_HOUR = 15 * 60 * 1000;
const emailOf = (req: Request) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200);
const loginPerAccount = rateLimit({
  windowMs: QUARTER_HOUR,
  max: 10,
  key: (req) => `${req.ip}|${emailOf(req)}`,
  message: 'Trop de tentatives de connexion pour ce compte. Réessayez dans 15 minutes.',
});
const loginPerIp = rateLimit({
  windowMs: QUARTER_HOUR,
  max: 100,
  message: 'Trop de tentatives de connexion depuis cette adresse. Réessayez dans 15 minutes.',
});
const registerPerIp = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Trop d’inscriptions depuis cette adresse. Réessayez plus tard.',
});
const refreshPerIp = rateLimit({ windowMs: QUARTER_HOUR, max: 300 });
// Suppression du compte : le mot de passe est vérifié ; 5 mauvais mots de passe par compte bloquent 15 minutes
const deletePasswordFailures = failureLimiter({ windowMs: QUARTER_HOUR, max: 5 });

const registerCompanySchema = z.object({
  companyName: z.string().min(1),
  legalName: z.string().optional(),
  taxId: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  user: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  }),
});

// Inscription d'une nouvelle entreprise (crée l'entreprise en statut "pending" + son premier utilisateur admin)
router.post('/register-company', registerPerIp, async (req: Request, res: Response) => {
  try {
    const data = registerCompanySchema.parse(req.body);

    const [existingCompany, existingUser] = await Promise.all([
      prisma.company.findUnique({ where: { taxId: data.taxId } }),
      prisma.user.findUnique({ where: { email: data.user.email } }),
    ]);

    if (existingCompany) {
      return res.status(400).json({ error: 'Une entreprise avec ce numéro fiscal existe déjà' });
    }
    if (existingUser) {
      return res.status(400).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }

    const passwordHash = await hashPassword(data.user.password);

    const company = await prisma.company.create({
      data: {
        name: data.companyName,
        legalName: data.legalName,
        taxId: data.taxId,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        status: 'pending',
        users: {
          create: {
            email: data.user.email,
            passwordHash,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            role: 'company_admin',
          },
        },
      },
      include: { users: true },
    });

    res.status(201).json({
      success: true,
      message: 'Votre entreprise a été enregistrée et est en attente de validation par notre équipe.',
      companyId: company.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors });
    }
    console.error('Error registering company:', error);
    res.status(500).json({ error: "Erreur lors de l'inscription" });
  }
});

const registerCustomerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
});

// Inscription d'un particulier : compte actif immédiatement, sans validation ni entreprise
router.post('/register', registerPerIp, async (req: Request, res: Response) => {
  try {
    const data = registerCustomerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Un compte existe déjà avec cet e-mail' });
    }

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: 'customer',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Votre compte a été créé. Vous pouvez vous connecter et commander.',
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors });
    }
    console.error('Error registering customer:', error);
    res.status(500).json({ error: "Erreur lors de l'inscription" });
  }
});

type SessionClient = 'mobile' | undefined;

// Réponse d'une connexion réussie (mot de passe ou code SMS) : jetons + profil
async function sessionResponse(user: User & { company: Company | null }, client: SessionClient) {
  const payload = { userId: user.id, role: user.role, companyId: user.companyId };
  const token = client === 'mobile' ? signToken(payload, MOBILE_ACCESS_TOKEN_TTL) : signToken(payload);
  // Application mobile : renouvelle la session sans redemander le mot de passe (POST /api/auth/refresh)
  const refreshToken = await issueRefreshToken(user.id);

  return {
    success: true,
    token,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      phone: user.verifiedPhone ?? user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    company: user.company
      ? {
          id: user.company.id,
          name: user.company.name,
          status: user.company.status,
          paymentTerms: user.company.paymentTerms,
        }
      : null,
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // « mobile » : jeton d'accès court (MOBILE_ACCESS_TOKEN_TTL), renouvelé par l'application ; absent = site web (7 jours)
  client: z.enum(['mobile']).optional(),
});

router.post('/login', loginPerIp, loginPerAccount, async (req: Request, res: Response) => {
  try {
    const { email, password, client } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    res.json(await sessionResponse(user, client));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Données invalides', details: error.errors });
    }
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { company: true },
    });

    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        // Numéro vérifié par SMS : permet la connexion par téléphone
        verifiedPhone: user.verifiedPhone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            status: user.company.status,
            paymentTerms: user.company.paymentTerms,
            creditLimit: user.company.creditLimit,
          }
        : null,
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Connexion par téléphone (code SMS) ----------
// 1. POST /phone/request-code : un code à 6 chiffres est envoyé par SMS ;
// 2. POST /phone/verify : le code ouvre la session. Numéro inconnu : le compte particulier est créé avec le prénom
//    et le nom (s'ils manquent, la réponse `needsProfile` les demande sans consommer le code).

const INVALID_PHONE = 'Numéro de mobile malgache invalide (ex. : 034 12 345 67)';
const phoneField = z
  .string({ message: INVALID_PHONE })
  .max(30, INVALID_PHONE)
  .transform((value, ctx) => {
    const local = normalizeMalagasyMobile(value);
    if (!local) ctx.addIssue({ code: z.ZodIssueCode.custom, message: INVALID_PHONE });
    return local ?? '';
  });
const CODE = 'Le code reçu par SMS comporte 6 chiffres';
const codeField = z.string({ message: CODE }).trim().regex(/^\d{6}$/, CODE);

const phoneOf = (req: Request) => normalizeMalagasyMobile(String(req.body?.phone ?? '').slice(0, 30)) ?? 'invalide';
// Un SMS coûte : 5 codes par numéro et par heure, et une limite large par adresse IP
const codePerPhone = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  key: (req) => `phone|${phoneOf(req)}`,
  message: 'Trop de codes demandés pour ce numéro. Réessayez dans une heure.',
});
const codePerIp = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Trop de codes demandés depuis cette adresse. Réessayez plus tard.',
});
const verifyPerIp = rateLimit({
  windowMs: QUARTER_HOUR,
  max: 100,
  message: 'Trop de tentatives depuis cette adresse. Réessayez dans 15 minutes.',
});

function sendCodeError(res: Response, result: Exclude<CheckCodeResult, 'ok'>) {
  return res.status(401).json({
    error: result === 'expired' ? 'Code expiré ou trop d’essais : demandez un nouveau code' : 'Code incorrect',
  });
}

// Le site n'affiche la connexion par téléphone que si les SMS sont configurés
router.get('/phone', (_req: Request, res: Response) => {
  res.json({ enabled: smsEnabled(), demo: isDemoSms() });
});

const requestCodeSchema = z.object({ phone: phoneField });

router.post('/phone/request-code', codePerIp, codePerPhone, async (req: Request, res: Response) => {
  try {
    const { phone } = requestCodeSchema.parse(req.body ?? {});
    if (!smsEnabled()) {
      return res.status(503).json({ error: 'La connexion par SMS est indisponible pour le moment' });
    }

    const created = await createPhoneCode(phone);
    if (!created.ok) {
      res.setHeader('Retry-After', String(created.retryAfter));
      return res.status(429).json({ error: `Patientez ${created.retryAfter} secondes avant de demander un nouveau code` });
    }

    const minutes = CODE_TTL_MS / 60_000;
    try {
      // Texte sans accents : un SMS accentué est découpé en messages de 70 caractères au lieu de 160
      await sendSms(phone, `Tsena Pro : votre code de connexion est ${created.code}. Il expire dans ${minutes} min. Ne le communiquez a personne.`);
    } catch (error) {
      console.error('Error sending login code SMS:', error);
      return res.status(502).json({ error: "L'envoi du SMS a échoué. Réessayez dans quelques instants." });
    }

    res.json({
      success: true,
      expiresInSeconds: CODE_TTL_MS / 1000,
      // Démonstration uniquement (SMS_PROVIDER=demo) : aucun SMS n'est envoyé, le code est affiché sur le site
      ...(isDemoSms() ? { demoCode: created.code } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error requesting login code:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const NAME = 'Prénom et nom requis (100 caractères maximum)';
const verifyCodeSchema = z.object({
  phone: phoneField,
  code: codeField,
  // Nouveau client : son nom (sinon la réponse `needsProfile` le demande)
  firstName: z.string({ message: NAME }).trim().min(1, NAME).max(100, NAME).optional(),
  lastName: z.string({ message: NAME }).trim().min(1, NAME).max(100, NAME).optional(),
  client: z.enum(['mobile']).optional(),
});

router.post('/phone/verify', verifyPerIp, async (req: Request, res: Response) => {
  try {
    const { phone, code, firstName, lastName, client } = verifyCodeSchema.parse(req.body ?? {});

    let user = await prisma.user.findUnique({ where: { verifiedPhone: phone }, include: { company: true } });
    if (user?.deletedAt) user = null;

    if (!user && !(firstName && lastName)) {
      // Code vérifié mais pas consommé : il resservira avec le prénom et le nom
      const result = await checkPhoneCode(phone, code, { consume: false });
      if (result !== 'ok') return sendCodeError(res, result);
      return res.json({ success: true, needsProfile: true });
    }

    const result = await checkPhoneCode(phone, code);
    if (result !== 'ok') return sendCodeError(res, result);

    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            verifiedPhone: phone,
            phone,
            firstName: firstName!,
            lastName: lastName!,
            // Pas de mot de passe : la connexion se fait par code SMS
            passwordHash: await hashPassword(randomBytes(32).toString('hex')),
            role: 'customer',
          },
          include: { company: true },
        });
      } catch (error: any) {
        // Deux validations simultanées du même numéro : le compte vient d'être créé par l'autre
        if (error?.code !== 'P2002') throw error;
        user = await prisma.user.findUnique({ where: { verifiedPhone: phone }, include: { company: true } });
        if (!user) throw error;
      }
    }

    res.json(await sessionResponse(user, client));
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error verifying login code:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

const linkPhoneSchema = z.object({ phone: phoneField, code: codeField });

// Ajoute un numéro vérifié à un compte existant (créé par e-mail) : il pourra ensuite se connecter par SMS
router.post('/phone/link', authenticate, verifyPerIp, async (req: Request, res: Response) => {
  try {
    const { phone, code } = linkPhoneSchema.parse(req.body ?? {});
    const owner = await prisma.user.findUnique({ where: { verifiedPhone: phone } });
    if (owner && owner.id !== req.user!.userId) {
      return res.status(409).json({ error: 'Ce numéro est déjà utilisé par un autre compte' });
    }

    const result = await checkPhoneCode(phone, code);
    if (result !== 'ok') return sendCodeError(res, result);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || user.deletedAt) return res.status(404).json({ error: 'Compte introuvable' });
    await prisma.user.update({
      where: { id: user.id },
      data: { verifiedPhone: phone, ...(user.phone ? {} : { phone }) },
    });

    res.json({ success: true, verifiedPhone: phone });
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Ce numéro est déjà utilisé par un autre compte' });
    console.error('Error linking phone:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Application mobile : renouvellement de session, déconnexion, suppression du compte ----------

const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

// Échange le jeton de renouvellement contre un nouveau jeton d'accès (et un nouveau jeton de renouvellement)
router.post('/refresh', refreshPerIp, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body, singleMessage('Jeton de renouvellement manquant'));
    const rotation = await rotateRefreshToken(refreshToken);
    if (!rotation.ok) {
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    }

    // Rôle et entreprise relus en base : un changement (validation de l'entreprise…) est pris en compte
    const user = await prisma.user.findUnique({ where: { id: rotation.userId } });
    if (!user || user.deletedAt) {
      await revokeAllRefreshTokens(rotation.userId);
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    }

    res.json({
      // Seule l'application utilise le renouvellement : jeton court
      token: signToken({ userId: user.id, role: user.role, companyId: user.companyId }, MOBILE_ACCESS_TOKEN_TTL),
      refreshToken: rotation.refreshToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error refreshing session:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Déconnexion d'un appareil : son jeton de renouvellement n'est plus utilisable
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body, singleMessage('Jeton de renouvellement manquant'));
    await revokeRefreshToken(refreshToken);
    res.status(204).end();
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error logging out:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mot de passe, ou code SMS pour un compte créé par téléphone (il n'a pas de mot de passe)
const deleteAccountSchema = z
  .object({ password: z.string().min(1).optional(), code: codeField.optional() })
  .refine((body) => body.password || body.code);

// Suppression du compte par l'utilisateur (exigée par l'App Store et le Play Store).
// Les données personnelles sont effacées ; les commandes sont conservées (obligations comptables), rattachées
// à un compte anonyme. Si c'était le dernier utilisateur d'une entreprise vendeuse, ses produits sont retirés de la vente.
router.delete('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const { password, code } = deleteAccountSchema.parse(
      req.body ?? {},
      singleMessage('Mot de passe (ou code reçu par SMS) requis pour supprimer le compte')
    );
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    if (user.role === 'platform_admin') {
      return res.status(403).json({ error: "Un compte administrateur ne peut pas être supprimé depuis l'application" });
    }
    const retryAfter = deletePasswordFailures.retryAfter(user.id);
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Trop de mots de passe incorrects. Réessayez dans 15 minutes.' });
    }
    if (password) {
      if (!(await comparePassword(password, user.passwordHash))) {
        deletePasswordFailures.fail(user.id);
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }
    } else {
      if (!user.verifiedPhone) {
        return res.status(400).json({ error: 'Aucun numéro vérifié sur ce compte : saisissez votre mot de passe' });
      }
      const result = await checkPhoneCode(user.verifiedPhone, code!);
      if (result !== 'ok') return sendCodeError(res, result);
    }
    deletePasswordFailures.reset(user.id);

    const unusablePassword = await hashPassword(randomBytes(32).toString('hex'));
    let productsWithdrawn = false;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: `supprime-${user.id}@compte-supprime.invalid`,
          firstName: 'Compte',
          lastName: 'supprimé',
          phone: null,
          verifiedPhone: null,
          passwordHash: unusablePassword,
          deletedAt: new Date(),
        },
      });
      // Adresses sans commande : effacées ; celles d'une commande restent liées à la commande
      await tx.address.deleteMany({ where: { userId: user.id, orders: { none: {} } } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });

      if (user.companyId) {
        const remaining = await tx.user.count({
          where: { companyId: user.companyId, deletedAt: null, id: { not: user.id } },
        });
        if (remaining === 0) {
          await tx.company.update({ where: { id: user.companyId }, data: { status: 'suspended' } });
          const { count } = await tx.product.updateMany({
            where: { sellerId: user.companyId, isActive: true },
            data: { isActive: false },
          });
          productsWithdrawn = count > 0;
        }
      }
    });

    if (productsWithdrawn) await invalidateProductCache();
    res.status(204).end();
  } catch (error) {
    if (error instanceof z.ZodError) return sendValidationError(res, error);
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du compte' });
  }
});

export default router;

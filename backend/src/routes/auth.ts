import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword, signToken } from '../lib/auth.js';
import { issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken } from '../lib/refreshTokens.js';
import { invalidateProductCache } from '../lib/cache.js';
import { sendValidationError, singleMessage } from '../lib/validation.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

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
router.post('/register-company', async (req: Request, res: Response) => {
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
router.post('/register', async (req: Request, res: Response) => {
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true },
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = signToken({ userId: user.id, role: user.role, companyId: user.companyId });
    // Application mobile : renouvelle la session sans redemander le mot de passe (POST /api/auth/refresh)
    const refreshToken = await issueRefreshToken(user.id);

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
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
    });
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

// ---------- Application mobile : renouvellement de session, déconnexion, suppression du compte ----------

const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

// Échange le jeton de renouvellement contre un nouveau jeton d'accès (et un nouveau jeton de renouvellement)
router.post('/refresh', async (req: Request, res: Response) => {
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
      token: signToken({ userId: user.id, role: user.role, companyId: user.companyId }),
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

const deleteAccountSchema = z.object({ password: z.string().min(1) });

// Suppression du compte par l'utilisateur (exigée par l'App Store et le Play Store).
// Les données personnelles sont effacées ; les commandes sont conservées (obligations comptables), rattachées
// à un compte anonyme. Si c'était le dernier utilisateur d'une entreprise vendeuse, ses produits sont retirés de la vente.
router.delete('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body ?? {}, singleMessage('Mot de passe requis pour supprimer le compte'));
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || user.deletedAt) {
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    if (user.role === 'platform_admin') {
      return res.status(403).json({ error: "Un compte administrateur ne peut pas être supprimé depuis l'application" });
    }
    if (!(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

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

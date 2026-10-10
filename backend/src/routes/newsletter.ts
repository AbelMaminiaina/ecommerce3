import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();

// Inscription publique : limite par adresse IP (évite d'inscrire en masse des adresses de tiers)
const subscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Trop de demandes. Réessayez plus tard.',
});

const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email invalide').max(200),
});

router.post('/', subscribeLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = newsletterSchema.parse(req.body);

    // Check if already subscribed
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email },
    });

    if (existing) {
      if (existing.isActive) {
        res.json({
          success: true,
          message: 'Vous êtes déjà inscrit à notre newsletter',
          alreadySubscribed: true,
        });
        return;
      }

      // Reactivate subscription
      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { isActive: true },
      });
    } else {
      // Create new subscription
      await prisma.newsletterSubscriber.create({
        data: { email },
      });
    }

    console.log('Newsletter subscription:', email);

    res.json({
      success: true,
      message: 'Inscription réussie ! Vous recevrez bientôt nos actualités.',
    });
  } catch (error) {
    console.error('Error processing newsletter subscription:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Email invalide',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Erreur lors de l'inscription",
    });
  }
});

// Nombre d'abonnés : réservé aux administrateurs
router.get('/', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const count = await prisma.newsletterSubscriber.count({
      where: { isActive: true },
    });
    res.json({ count });
  } catch (error) {
    console.error('Error fetching subscriber count:', error);
    res.status(500).json({ error: 'Failed to fetch count' });
  }
});

// Désinscription d'une adresse : réservée aux administrateurs (sinon n'importe qui pourrait désinscrire n'importe qui).
// Un lien de désinscription dans les e-mails devra porter un jeton signé propre à l'abonné.
router.delete('/:email', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { email } = req.params;

    await prisma.newsletterSubscriber.update({
      where: { email },
      data: { isActive: false },
    });

    res.json({
      success: true,
      message: 'Désinscription réussie',
    });
  } catch (error) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la désinscription',
    });
  }
});

export default router;

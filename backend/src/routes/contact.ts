import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();

// Formulaire public : limite par adresse IP contre le spam
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Trop de messages envoyés. Réessayez plus tard.',
});

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(5000),
  consent: z.boolean().refine((val) => val === true),
});

router.post('/', contactLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = contactSchema.parse(req.body);

    // Save to database
    const contactMessage = await prisma.contactMessage.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        subject: validatedData.subject,
        message: validatedData.message,
      },
    });

    console.log('Contact form submission saved:', contactMessage.id);

    res.json({
      success: true,
      message: 'Message envoyé avec succès',
      id: contactMessage.id,
    });
  } catch (error) {
    console.error('Error processing contact form:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Données invalides',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Erreur lors de l'envoi du message",
    });
  }
});

// Messages reçus : réservés aux administrateurs (ils contiennent des données personnelles)
router.get('/', authenticate, requirePlatformAdmin, async (_req: Request, res: Response) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Mark message as read
router.patch('/:id/read', authenticate, requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.contactMessage.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

export default router;

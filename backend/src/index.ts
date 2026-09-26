import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products.js';
import contactRouter from './routes/contact.js';
import checkoutRouter from './routes/checkout.js';
import newsletterRouter from './routes/newsletter.js';
import categoriesRouter from './routes/categories.js';
import authRouter from './routes/auth.js';
import companiesRouter from './routes/companies.js';
import sellerRouter from './routes/seller.js';
import sellersRouter from './routes/sellers.js';
import paymentsRouter from './routes/payments.js';
import payoutsRouter from './routes/payouts.js';
import autoPaymentsRouter from './routes/autoPayments.js';
import { startAutoPaymentReconcileJob } from './services/mobileMoneyPayments.js';
import { setupDemoPayments } from './services/demoPayments.js';
import { startOrderExpiryJob } from './services/orderExpiry.js';
import adminProductsRouter from './routes/adminProducts.js';
import uploadsRouter from './routes/uploads.js';
import { UPLOAD_DIR, UPLOADS_URL_PREFIX } from './lib/uploads.js';
import { connectRedis, redis, isRedisAvailable } from './lib/redis.js';
import { authenticate, requirePlatformAdmin } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Derrière nginx : req.ip doit être l'adresse du client (limitation de débit des commandes invitées)
app.set('trust proxy', 1);

// Middleware
// En développement, l'aperçu web de l'application mobile (Expo, port 8081) est aussi autorisé.
// Les applications Android et iPhone n'envoient pas d'en-tête Origin : le CORS ne les concerne pas.
const corsOrigins = [process.env.FRONTEND_URL || 'http://localhost:3000'];
if (process.env.NODE_ENV !== 'production') corsOrigins.push('http://localhost:8081');
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));
// Les images arrivent en fichiers (POST /api/uploads), plus en JSON : les corps JSON restent petits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Images téléversées : noms uniques jamais réécrits => cache navigateur / Cloudflare d'un an
app.use(
  UPLOADS_URL_PREFIX,
  express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false, fallthrough: false })
);

// Routes
app.use('/api/products', productsRouter);
app.use('/api/contact', contactRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/auth', authRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/seller', sellerRouter);
app.use('/api/sellers', sellersRouter);
app.use('/api/payments/auto', autoPaymentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/admin/products', adminProductsRouter);
app.use('/api/uploads', uploadsRouter);

// Health check with Redis status
app.get('/api/health', async (_req, res) => {
  let redisStatus = 'not_configured';

  if (isRedisAvailable) {
    try {
      await redis.ping();
      redisStatus = 'connected';
    } catch (err) {
      redisStatus = 'error';
      console.error('Redis ping failed:', err);
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: redisStatus,
    env: {
      hasUpstashUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
      hasUpstashToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
    },
  });
});

// Cache stats endpoint
app.get('/api/cache/stats', async (_req, res) => {
  try {
    const info = await redis.info('stats');
    const dbSize = await redis.dbsize();
    res.json({
      keys: dbSize,
      info: info,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Clear cache endpoint (for admin use)
app.delete('/api/cache', authenticate, requirePlatformAdmin, async (_req, res) => {
  try {
    await redis.flushdb();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Start server
async function start() {
  // Connect to Redis
  await connectRedis();

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });

  // Démo uniquement (DEMO_PAYMENTS=true) : opérateurs Mobile Money simulés, avant la lecture de leur configuration
  setupDemoPayments(app, Number(PORT));

  // Annule les commandes non payées passé le délai (libère le stock réservé)
  startOrderExpiryJob();
  // Vérifie auprès des opérateurs (MVola, Orange Money, Airtel Money) les paiements automatiques en attente
  startAutoPaymentReconcileJob();
}

start().catch(console.error);

import type { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  /** Fenêtre en millisecondes */
  windowMs: number;
  /** Nombre maximum de requêtes par clé dans la fenêtre */
  max: number;
  /** Message de la réponse 429 */
  message?: string;
  /** Clé de comptage (par défaut l'adresse IP) : ex. IP + e-mail pour la connexion */
  key?: (req: Request) => string;
}

// Limiteur de débit en mémoire (par adresse IP). Suffisant pour une instance unique ; derrière
// un proxy (nginx), `app.set('trust proxy', 1)` doit être actif pour que req.ip soit l'IP du client.
export function rateLimit({ windowMs, max, message = 'Trop de requêtes, réessayez plus tard.', key: keyOf }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyOf ? keyOf(req) : req.ip ?? 'inconnue';
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // Nettoyage occasionnel des entrées expirées
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: message });
    }
    next();
  };
}

// Compteur d'échecs (ex. mauvais mot de passe) : seules les erreurs comptent, un succès remet le compteur à zéro.
export function failureLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  const current = (key: string) => {
    const entry = failures.get(key);
    if (entry && entry.resetAt <= Date.now()) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    /** Secondes avant de pouvoir réessayer, ou 0 si l'essai est permis */
    retryAfter(key: string): number {
      const entry = current(key);
      return entry && entry.count >= max ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
    },
    fail(key: string) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, resetAt: Date.now() + windowMs });
    },
    reset(key: string) {
      failures.delete(key);
    },
  };
}

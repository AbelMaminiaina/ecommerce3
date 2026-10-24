// Conseiller IA : propose des produits du catalogue à partir d'une question libre du client.
// Utilise Mistral (MISTRAL_API_KEY), puis Gemini (GEMINI_API_KEY) en secours ; une recherche
// par mots-clés sert de dernier recours (aucune clé, ou les deux IA échouent / dépassent leur quota).
//
// Conçu pour durer sur les offres gratuites de Mistral et Gemini :
//  - seuls les produits utiles à la question sont envoyés (ADVISOR_CATALOG_SIZE, 25 par défaut), avec des
//    descriptions raccourcies : environ 10 fois moins de texte qu'avec tout le catalogue ;
//  - la réponse demandée est courte (300 tokens au plus) ;
//  - un fournisseur qui signale un quota dépassé (429) est mis en pause, de 1 minute à 1 heure, au lieu d'être
//    rappelé à chaque question ;
//  - les réponses sont gardées en cache (routes/advisor.ts) : une même question n'est payée qu'une fois.

export interface CatalogItem {
  slug: string;
  name: string;
  category: string;
  shortDescription: string;
  price: number;
  inStock: boolean;
  availableFrom: Date | null;
  freeShipping: boolean;
  moq: number;
  unit: string;
  seller: { name: string } | null;
}

export interface Advice {
  message: string;
  slugs: string[];
  source: 'ai' | 'fallback';
}

const MAX_SUGGESTIONS = 4;
const AI_TIMEOUT_MS = 15000;
const MAX_ANSWER_TOKENS = 300;
const DESCRIPTION_CHARS = 90;

function catalogSize(): number {
  const value = Number(process.env.ADVISOR_CATALOG_SIZE);
  return Number.isInteger(value) && value >= 5 && value <= 300 ? value : 25;
}

// Mots utiles d'une question, avec leur début pour tolérer pluriels et variantes (« perceuses » -> « perceu »)
function questionWords(question: string): string[] {
  return normalizeText(question)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .map((w) => (w.length >= 6 ? w.slice(0, w.length - 2) : w));
}

const haystackOf = (item: CatalogItem) =>
  normalizeText(`${item.name} ${item.category.replace(/_/g, ' ')} ${item.seller?.name || ''} ${item.shortDescription}`);

/**
 * Produits envoyés à l'IA : d'abord ceux dont le texte reprend des mots de la question, puis, pour que l'IA puisse
 * faire le lien qu'une recherche par mots ne fait pas (« salle de bain » -> robinetterie), quelques produits de
 * chaque catégorie, en stock en priorité. Le catalogue arrive trié : en stock et récents d'abord.
 */
export function selectCatalog(question: string, catalog: CatalogItem[], size = catalogSize()): CatalogItem[] {
  if (catalog.length <= size) return catalog;
  const words = questionWords(question);
  const matches = catalog
    .map((item, index) => ({ item, index, score: words.filter((w) => haystackOf(item).includes(w)).length }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.ceil(size * 0.6))
    .map((m) => m.item);

  const chosen = new Set(matches);
  const byCategory = new Map<string, CatalogItem[]>();
  for (const item of catalog) {
    if (chosen.has(item)) continue;
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }
  // Tour à tour, un produit de chaque catégorie, jusqu'à la taille voulue
  const queues = [...byCategory.values()];
  const result = [...matches];
  for (let round = 0; result.length < size && queues.some((q) => q.length > round); round++) {
    for (const queue of queues) {
      if (result.length >= size) break;
      if (queue[round]) result.push(queue[round]);
    }
  }
  return result;
}

// Pause des fournisseurs qui ont signalé un quota dépassé : on ne les rappelle pas avant la fin de la pause
const pauses = new Map<string, { until: number; strikes: number }>();

export function resetProviderPauses(): void {
  pauses.clear();
}

class ProviderError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

async function providerError(name: string, response: Response): Promise<ProviderError> {
  const retryAfter = Number(response.headers?.get?.('retry-after'));
  return new ProviderError(
    `${name} API error: ${response.status} ${(await response.text()).slice(0, 300)}`,
    response.status,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
  );
}

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

/**
 * Plan B sans IA : classe les produits selon le nombre de mots de la question
 * retrouvés dans leur nom / catégorie / vendeur / description.
 */
/** Produits dont le texte reprend des mots de la question, les plus proches d'abord (en stock en priorité) */
export function keywordMatches(question: string, catalog: CatalogItem[]): CatalogItem[] {
  const words = questionWords(question);
  return catalog
    .map((item) => ({ item, score: words.filter((w) => haystackOf(item).includes(w)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || Number(b.item.inStock) - Number(a.item.inStock))
    .map(({ item }) => item);
}

export function keywordAdvice(question: string, catalog: CatalogItem[]): Advice {
  const scored = keywordMatches(question, catalog).map((item) => ({ item }));

  if (scored.length === 0) {
    return {
      message:
        "Je n'ai pas trouvé de produit correspondant exactement à votre demande. Voici quelques produits disponibles en ce moment.",
      slugs: catalog.filter((i) => i.inStock).slice(0, MAX_SUGGESTIONS).map((i) => i.slug),
      source: 'fallback',
    };
  }

  return {
    message: 'Voici les produits qui correspondent le mieux à votre demande.',
    slugs: scored.slice(0, MAX_SUGGESTIONS).map(({ item }) => item.slug),
    source: 'fallback',
  };
}

function buildPrompt(catalog: CatalogItem[]): string {
  const now = new Date();
  const lines = catalog.map((i) => {
    const availability = !i.inStock
      ? 'épuisé'
      : i.availableFrom && i.availableFrom > now
        ? `en précommande, disponible le ${i.availableFrom.toISOString().slice(0, 10)}`
        : 'disponible';
    return [
      `slug=${i.slug}`,
      i.name,
      `catégorie=${i.category.replace(/_/g, '-')}`,
      `${i.price} Ar / ${i.unit}`,
      i.moq > 1 ? `minimum ${i.moq} ${i.unit}` : null,
      availability,
      i.freeShipping ? 'livraison gratuite' : null,
      i.seller ? `vendu par ${i.seller.name}` : null,
      i.shortDescription.length > DESCRIPTION_CHARS ? `${i.shortDescription.slice(0, DESCRIPTION_CHARS)}…` : i.shortDescription,
    ]
      .filter(Boolean)
      .join(' | ');
  });

  return `Tu es le conseiller de Tsena Pro, une place de marché en ligne à Madagascar qui vend aux professionnels (prix de gros) comme aux particuliers.
Tu aides les clients à choisir des produits du catalogue. Réponds en français, en vouvoyant le client, avec un ton chaleureux et concis (3 phrases maximum), en texte simple sans mise en forme Markdown (pas de **, de #, ni de listes).
Règles :
- Ne propose QUE des produits de la liste ci-dessous, en renvoyant leur slug exact dans "slugs" (jamais dans le message).
- Propose entre 1 et ${MAX_SUGGESTIONS} produits, les plus pertinents d'abord. Évite les produits épuisés sauf s'il n'y a rien d'autre.
- Si un produit est en précommande ou impose une quantité minimum, signale-le.
- Si la question n'a rien à voir avec la boutique ou ses produits, réponds poliment que tu ne peux conseiller que sur les produits de Tsena Pro et renvoie une liste vide.
- N'invente jamais de prix, de produit, de remise ou de promesse de livraison.

Produits du catalogue utiles pour cette question (prix unitaires de base en Ariary) :
${lines.join('\n')}`;
}

// Les petits modèles glissent parfois du Markdown ou des « (slug: …) » dans le texte affiché au client
export function cleanMessage(text: string): string {
  return text
    .replace(/\s*\(\s*slug\s*[:=][^)]*\)/gi, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
}

// Garde la réponse de l'IA seulement si elle a la bonne forme, et seulement les produits qui existent vraiment
function parseAiAnswer(text: string, catalog: CatalogItem[]): Advice {
  const parsed = JSON.parse(text) as { message?: unknown; slugs?: unknown };
  if (typeof parsed.message !== 'string' || !Array.isArray(parsed.slugs)) {
    throw new Error('AI returned an unexpected shape');
  }

  const known = new Set(catalog.map((i) => i.slug));
  const slugs = [...new Set(parsed.slugs.filter((s): s is string => typeof s === 'string' && known.has(s)))];
  // Que des produits inventés (aucun n'existe) : réponse inutilisable, le fournisseur suivant ou les données locales prennent le relais
  if (parsed.slugs.length > 0 && slugs.length === 0) {
    throw new Error('AI suggested only unknown products');
  }

  return {
    message: cleanMessage(parsed.message),
    slugs: slugs.slice(0, MAX_SUGGESTIONS),
    source: 'ai',
  };
}

async function mistralAdvice(question: string, catalog: CatalogItem[], apiKey: string): Promise<Advice> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || 'ministral-8b-latest',
      temperature: 0.4,
      max_tokens: MAX_ANSWER_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${buildPrompt(catalog)}\n\nRéponds uniquement avec un objet JSON de la forme {"message": "...", "slugs": ["..."]}.`,
        },
        { role: 'user', content: question },
      ],
    }),
  });

  if (!response.ok) throw await providerError('Mistral', response);

  const data: any = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text) {
    throw new Error('Mistral API returned no content');
  }

  return parseAiAnswer(text, catalog);
}

async function geminiAdvice(question: string, catalog: CatalogItem[], apiKey: string): Promise<Advice> {
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildPrompt(catalog) }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: MAX_ANSWER_TOKENS,
        // Réflexion minimale : la tâche est simple et le client attend la réponse
        thinkingConfig: { thinkingLevel: 'low' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            message: { type: 'STRING' },
            slugs: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['message', 'slugs'],
        },
      },
    }),
  });

  if (!response.ok) throw await providerError('Gemini', response);

  const data: any = await response.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.find((p) => typeof p.text === 'string' && !p.thought)?.text;
  if (!text) {
    throw new Error('Gemini API returned no content');
  }

  return parseAiAnswer(text, catalog);
}

type Provider = {
  name: string;
  apiKey: string | undefined;
  ask: (question: string, catalog: CatalogItem[], apiKey: string) => Promise<Advice>;
};

/** Une IA est configurée : seules ses réponses coûtent (quota Mistral / Gemini) */
export const aiConfigured = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.MISTRAL_API_KEY?.trim() || env.GEMINI_API_KEY?.trim());

export async function getAdvice(question: string, fullCatalog: CatalogItem[], now = Date.now()): Promise<Advice> {
  if (fullCatalog.length === 0) {
    return keywordAdvice(question, fullCatalog);
  }
  const catalog = selectCatalog(question, fullCatalog);

  // Mistral d'abord, Gemini en secours (quota épuisé, panne…), puis recherche par mots-clés
  const providers: Provider[] = [
    { name: 'Mistral', apiKey: process.env.MISTRAL_API_KEY, ask: mistralAdvice },
    { name: 'Gemini', apiKey: process.env.GEMINI_API_KEY, ask: geminiAdvice },
  ];

  for (const { name, apiKey, ask } of providers) {
    if (!apiKey) continue;
    const pause = pauses.get(name);
    if (pause && pause.until > now) continue; // quota dépassé récemment : on passe au suivant
    try {
      const advice = await ask(question, catalog, apiKey);
      pauses.delete(name);
      // Aucun produit proposé (question mal comprise ou hors sujet) : on garde le message de l'IA et on ajoute les
      // produits de la boutique qui reprennent des mots de la question, s'il y en a
      if (advice.slugs.length === 0) {
        const local = keywordMatches(question, fullCatalog).slice(0, MAX_SUGGESTIONS);
        if (local.length > 0) return { ...advice, slugs: local.map((i) => i.slug) };
      }
      return advice;
    } catch (error) {
      if (error instanceof ProviderError && error.status === 429) {
        // Pause de 1 minute, doublée à chaque nouveau refus (1 heure au plus), ou la durée indiquée par le fournisseur
        const strikes = (pause?.strikes ?? 0) + 1;
        const seconds = error.retryAfterSeconds ?? Math.min(60 * 2 ** (strikes - 1), 3600);
        pauses.set(name, { until: now + seconds * 1000, strikes });
        console.warn(`Advisor: ${name} quota dépassé, en pause ${seconds} s`);
      } else {
        console.error(`Advisor: ${name} failed, trying next provider:`, error);
      }
    }
  }

  // Recherche par mots-clés sur tout le catalogue (pas seulement les produits envoyés à l'IA)
  return keywordAdvice(question, fullCatalog);
}

// Conseiller IA : propose des produits du catalogue à partir d'une question libre du client.
// Utilise Mistral (MISTRAL_API_KEY), puis Gemini (GEMINI_API_KEY) en secours ; une recherche
// par mots-clés sert de dernier recours (aucune clé, ou les deux IA échouent / dépassent leur quota).

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
export function keywordAdvice(question: string, catalog: CatalogItem[]): Advice {
  const words = normalizeText(question)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

  const scored = catalog
    .map((item) => {
      const haystack = normalizeText(
        `${item.name} ${item.category.replace(/_/g, ' ')} ${item.seller?.name || ''} ${item.shortDescription}`
      );
      const score = words.filter((w) => haystack.includes(w)).length;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || Number(b.item.inStock) - Number(a.item.inStock));

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
      i.shortDescription,
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

Catalogue (prix unitaires de base en Ariary) :
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
      max_tokens: 600,
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

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.status} ${await response.text()}`);
  }

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

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

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

export async function getAdvice(question: string, catalog: CatalogItem[]): Promise<Advice> {
  if (catalog.length === 0) {
    return keywordAdvice(question, catalog);
  }

  // Mistral d'abord, Gemini en secours (quota épuisé, panne…), puis recherche par mots-clés
  const providers: Provider[] = [
    { name: 'Mistral', apiKey: process.env.MISTRAL_API_KEY, ask: mistralAdvice },
    { name: 'Gemini', apiKey: process.env.GEMINI_API_KEY, ask: geminiAdvice },
  ];

  for (const { name, apiKey, ask } of providers) {
    if (!apiKey) continue;
    try {
      return await ask(question, catalog, apiKey);
    } catch (error) {
      console.error(`Advisor: ${name} failed, trying next provider:`, error);
    }
  }

  return keywordAdvice(question, catalog);
}

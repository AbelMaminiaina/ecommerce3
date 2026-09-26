// Coordonnées de contact affichées sur tout le site (en-têtes, pieds de page, page contact, mentions légales,
// données structurées pour Google). Un seul endroit à modifier.

export const CONTACT = {
  email: 'savatry.milamina@gmail.com',
  // À CONFIRMER : ces numéros sont ceux de l'ancien projet, à remplacer par les numéros de contact de Tsena Pro
  // (ajouter une ligne par numéro ; `tel` est le format international pour le lien « appeler »).
  phones: [{ display: '038 01 001 01', tel: '+261380100101' }],
  address: {
    street: 'IVB X',
    locality: 'Ambodivonkely Ambohimanarina',
    country: 'Madagascar',
  },
} as const;

// « IVB X, Ambodivonkely Ambohimanarina, Madagascar » (sur une seule ligne)
export const CONTACT_ADDRESS_INLINE = `${CONTACT.address.street}, ${CONTACT.address.locality}, ${CONTACT.address.country}`;

export const CONTACT_MAILTO = `mailto:${CONTACT.email}`;
export const CONTACT_PHONE_LINKS = CONTACT.phones.map((p) => ({ display: p.display, href: `tel:${p.tel}` }));

// Carte Google intégrée (sans clé d'API) centrée sur l'adresse ; le repère est approximatif si l'adresse exacte n'est pas connue de Google
export const CONTACT_MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(
  `${CONTACT.address.locality}, Antananarivo, ${CONTACT.address.country}`
)}&output=embed`;

// Réseaux sociaux (page contact). À COMPLÉTER : remplacer « # » par l'adresse des pages de Tsena Pro.
export const SOCIAL_LINKS = [
  { label: 'Facebook', icon: 'bi-facebook', href: '#' },
  { label: 'LinkedIn', icon: 'bi-linkedin', href: '#' },
  { label: 'Instagram', icon: 'bi-instagram', href: '#' },
  { label: 'X', icon: 'bi-twitter-x', href: '#' },
];

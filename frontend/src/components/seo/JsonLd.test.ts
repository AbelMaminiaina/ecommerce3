import { describe, it, expect } from 'vitest';
import { jsonLdHtml } from './JsonLd';

describe('jsonLdHtml', () => {
  it('empêche un nom de produit de fermer la balise <script> (XSS)', () => {
    const html = jsonLdHtml({ name: '</script><script>alert(1)</script>' });
    expect(html).not.toContain('<');
    expect(html).not.toContain('>');
  });

  it('reste du JSON valide qui redonne exactement les mêmes données', () => {
    const data = { name: 'Riz & huile <promo> \u2028 fin', price: 1500 };
    expect(JSON.parse(jsonLdHtml(data))).toEqual(data);
  });
});

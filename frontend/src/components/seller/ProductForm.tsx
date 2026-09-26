'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { useCategories } from '@/hooks/useCategories';
import { MIN_WHOLESALE_QTY } from '@/lib/utils';
import { uploadImage } from '@/lib/api/uploads';
import { createSellerProduct, updateSellerProduct, type SellerProductInput } from '@/lib/api/seller';
import type { Product } from '@/types';

interface Tier {
  minQty: string;
  unitPrice: string;
}

interface ProductFormProps {
  /** Produit à modifier ; absent = création */
  product?: Product;
}

const MAX_IMAGES = 5;

// Formulaire de publication / modification d'un produit par une entreprise vendeuse.
// La quantité minimum ne peut pas descendre sous le plancher de vente en gros de la plateforme ;
// toute création ou modification passe ensuite par la validation de l'administrateur.
export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { categories } = useCategories();

  const [name, setName] = useState(product?.name ?? '');
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [unit, setUnit] = useState(product?.unit ?? 'pièce');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [moq, setMoq] = useState(product ? String(product.moq) : String(MIN_WHOLESALE_QTY));
  const [stock, setStock] = useState(product ? String(product.stockQuantity ?? 0) : '');
  const [weight, setWeight] = useState(product?.estimatedWeightKg ? String(product.estimatedWeightKg) : '');
  const [freeShipping, setFreeShipping] = useState(product?.freeShipping ?? false);
  const [characteristics, setCharacteristics] = useState((product?.characteristics ?? []).join('\n'));
  const [tiers, setTiers] = useState<Tier[]>(
    (product?.priceTiers ?? []).map((t) => ({ minQty: String(t.minQty), unitPrice: String(t.unitPrice) }))
  );
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categoryOptions = categories
    .filter((c) => c.isActive)
    .map((c) => ({ value: c.slug, label: c.name }));

  // Chaque photo est envoyée tout de suite ; le produit ne garde que son URL
  const handleFiles = async (files: FileList | null) => {
    const token = session?.accessToken;
    if (!files || !token) return;
    setImageError(null);
    const selected = Array.from(files).slice(0, MAX_IMAGES - images.length - uploading);
    if (files.length > selected.length) setImageError(`${MAX_IMAGES} images maximum`);
    setUploading((n) => n + selected.length);
    await Promise.all(
      selected.map(async (file) => {
        try {
          const url = await uploadImage(file, token);
          setImages((current) => [...current, url]);
        } catch (err) {
          setImageError(err instanceof Error ? err.message : 'Image invalide');
        } finally {
          setUploading((n) => n - 1);
        }
      })
    );
  };

  const updateTier = (index: number, patch: Partial<Tier>) =>
    setTiers((current) => current.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = session?.accessToken;
    if (!token) return;

    const moqValue = Number(moq);
    if (!Number.isInteger(moqValue) || moqValue < MIN_WHOLESALE_QTY) {
      setError(`Vente en gros uniquement : la quantité minimum doit être d'au moins ${MIN_WHOLESALE_QTY}.`);
      return;
    }

    const payload: SellerProductInput = {
      name: name.trim(),
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      category,
      unit: unit.trim(),
      price: Number(price),
      moq: moqValue,
      stockQuantity: Number(stock || 0),
      estimatedWeightKg: weight ? Number(weight) : null,
      freeShipping,
      characteristics: characteristics.split('\n').map((c) => c.trim()).filter(Boolean),
      images,
      priceTiers: tiers
        .filter((t) => t.minQty && t.unitPrice)
        .map((t) => ({ minQty: Number(t.minQty), unitPrice: Number(t.unitPrice) })),
    };

    setSaving(true);
    setError(null);
    try {
      if (product) await updateSellerProduct(product.id, payload, token);
      else await createSellerProduct(payload, token);
      router.push('/vendeur?saved=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer le produit");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {product && product.status === 'rejected' && product.rejectionReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Produit refusé :</strong> {product.rejectionReason}. Corrigez-le et enregistrez pour le soumettre
          à nouveau.
        </div>
      )}

      <section className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-warm-800">Informations</h2>
        <Input label="Nom du produit" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} />
        <Input
          label="Résumé"
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          helperText="Une phrase affichée dans les listes"
          required
          maxLength={200}
        />
        <Textarea
          label="Description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={10}
        />
        <Textarea
          label="Caractéristiques"
          rows={4}
          value={characteristics}
          onChange={(e) => setCharacteristics(e.target.value)}
          helperText="Une caractéristique par ligne (10 maximum)"
        />
        <Select
          label="Catégorie"
          options={categoryOptions}
          placeholder="Choisissez une catégorie"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        />
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-warm-800">Vente en gros</h2>
        <p className="text-sm text-warm-600">
          La plateforme vend uniquement en gros : la quantité minimum de commande doit être d&apos;au moins{' '}
          <strong>{MIN_WHOLESALE_QTY}</strong>. Elle s&apos;applique aux particuliers comme aux entreprises.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Unité de vente" value={unit} onChange={(e) => setUnit(e.target.value)} required maxLength={30} helperText="pièce, carton, kg…" />
          <Input label="Prix unitaire de base (Ar)" type="number" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
          <Input
            label="Quantité minimum de commande"
            type="number"
            min={MIN_WHOLESALE_QTY}
            step={1}
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
            required
            helperText={`Minimum imposé par la plateforme : ${MIN_WHOLESALE_QTY}`}
          />
          <Input label="Stock disponible" type="number" min={0} step={1} value={stock} onChange={(e) => setStock(e.target.value)} required />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium text-warm-800">Tarifs dégressifs (facultatif)</h3>
            {tiers.length < 5 && (
              <button
                type="button"
                onClick={() => setTiers((current) => [...current, { minQty: '', unitPrice: '' }])}
                className="inline-flex items-center gap-1 text-sm font-medium text-prairie-600 hover:underline"
              >
                <i className="bi bi-plus-lg text-[16px] leading-none" aria-hidden="true" /> Ajouter un palier
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-warm-500">
            Réservés aux comptes entreprise approuvés. Chaque palier commence au-dessus de la quantité minimum, à un
            prix inférieur au prix de base.
          </p>
          {tiers.map((tier, index) => (
            <div key={index} className="mb-2 flex items-end gap-3">
              <Input label="À partir de (quantité)" type="number" min={1} value={tier.minQty} onChange={(e) => updateTier(index, { minQty: e.target.value })} />
              <Input label="Prix unitaire (Ar)" type="number" min={1} value={tier.unitPrice} onChange={(e) => updateTier(index, { unitPrice: e.target.value })} />
              <button
                type="button"
                onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}
                className="mb-1 rounded-full p-2 text-red-500 hover:bg-red-50"
                aria-label="Supprimer le palier"
              >
                <i className="bi bi-trash text-[20px] leading-none" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-warm-800">Livraison</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Poids estimé par unité (kg)" type="number" min={0} step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} helperText="Indicatif, n'entre pas dans le prix" />
        </div>
        <Checkbox label="Livraison offerte pour ce produit" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} />
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-warm-800">Photos ({images.length}/{MAX_IMAGES})</h2>
        <div className="flex flex-wrap gap-3">
          {images.map((src, index) => (
            <div key={index} className="relative h-28 w-28 overflow-hidden rounded-lg border border-warm-200 bg-warm-50">
              <Image src={src} alt={`Photo ${index + 1}`} fill sizes="112px" className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-600 shadow"
                aria-label={`Retirer la photo ${index + 1}`}
              >
                <i className="bi bi-x-lg text-[16px] leading-none" aria-hidden="true" />
              </button>
            </div>
          ))}
          {uploading > 0 && (
            <div className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-warm-200 bg-warm-50 text-sm text-warm-500" role="status">
              <i className="bi bi-arrow-repeat animate-spin inline-block text-[20px] leading-none" aria-hidden="true" />
              Envoi…
            </div>
          )}
          {images.length + uploading < MAX_IMAGES && (
            <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-warm-300 text-sm text-warm-500 hover:border-prairie-500 hover:text-prairie-600">
              <i className="bi bi-upload text-[20px] leading-none" aria-hidden="true" />
              Ajouter
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {imageError && <p role="alert" className="text-sm text-red-600">{imageError}</p>}
        <p className="text-xs text-warm-500">PNG, JPEG ou WebP, 8 Mo maximum. Les photos sont optimisées automatiquement.</p>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link href="/vendeur" className="text-sm text-warm-600 hover:underline">
          Annuler
        </Link>
        <Button type="submit" loading={saving} disabled={uploading > 0} size="lg">
          {product ? 'Enregistrer et soumettre à validation' : 'Publier (soumettre à validation)'}
        </Button>
      </div>
      <p className="text-center text-xs text-warm-500">
        Votre produit sera visible dans le catalogue dès qu&apos;un administrateur l&apos;aura validé.
      </p>
    </form>
  );
}

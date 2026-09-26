'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Button, Modal } from '@/components/ui';
import { formatPrice, formatQuantity, getCategoryLabel, getProductImage } from '@/lib/utils';
import { approveProduct, getProductsToModerate, rejectProduct } from '@/lib/api/seller';
import type { Product, ProductStatus } from '@/types';

type ModerationProduct = Awaited<ReturnType<typeof getProductsToModerate>>['products'][number];

const filters: { key: ProductStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Validés' },
  { key: 'rejected', label: 'Refusés' },
  { key: 'all', label: 'Tous' },
];

const statusStyle: Record<ProductStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const statusName: Record<ProductStatus, string> = {
  pending: 'En attente',
  approved: 'Validé',
  rejected: 'Refusé',
};

// Modération des produits publiés par les entreprises vendeuses
export default function AdminProductsPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [filter, setFilter] = useState<ProductStatus | 'all'>('pending');
  const [products, setProducts] = useState<ModerationProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ModerationProduct | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setProducts((await getProductsToModerate(filter, token)).products);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les produits');
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (product: Product) => {
    if (!token) return;
    try {
      await approveProduct(product.id, token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation impossible');
    }
  };

  const confirmReject = async () => {
    if (!token || !rejecting) return;
    setSaving(true);
    try {
      await rejectProduct(rejecting.id, reason.trim(), token);
      setRejecting(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refus impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-warm-800">Produits des vendeurs</h1>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === f.key ? 'bg-prairie-600 text-white' : 'bg-white text-warm-600 hover:bg-warm-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-prairie-600" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center">
          <i className="bi bi-clipboard-check mx-auto mb-4 text-warm-300 text-[48px] leading-none" aria-hidden="true" />
          <p className="text-warm-600">Aucun produit dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product) => {
            const status = (product.status ?? 'approved') as ProductStatus;
            return (
              <div key={product.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-warm-50">
                    <Image src={getProductImage(product)} alt={product.name} fill sizes="112px" className="object-cover" unoptimized />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-warm-800">{product.name}</h2>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[status]}`}>
                        {statusName[status]}
                      </span>
                    </div>
                    <p className="text-sm text-warm-600">
                      Vendeur : <strong>{product.seller.name}</strong> ({product.seller.contactEmail}) ·{' '}
                      {getCategoryLabel(product.category)}
                    </p>
                    <p className="text-sm text-warm-600">
                      {formatPrice(product.price)} / {product.unit} · minimum {formatQuantity(product.moq, product.unit)}
                      {product.priceTiers.length > 0 &&
                        ' · paliers : ' +
                          product.priceTiers.map((t) => `${t.minQty}+ → ${formatPrice(t.unitPrice)}`).join(', ')}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-warm-700">{product.description}</p>
                    {product.rejectionReason && (
                      <p className="mt-1 text-sm text-red-600">Motif du refus : {product.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    {status !== 'approved' && (
                      <Button size="sm" icon={<i className="bi bi-check-lg text-[16px] leading-none" aria-hidden="true" />} onClick={() => approve(product)}>
                        Valider
                      </Button>
                    )}
                    {status !== 'rejected' && (
                      <Button size="sm" variant="outline" icon={<i className="bi bi-x-lg text-[16px] leading-none" aria-hidden="true" />} onClick={() => setRejecting(product)}>
                        Refuser
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={!!rejecting} onClose={() => setRejecting(null)} title="Refuser ce produit">
        <p className="mb-3 text-sm text-warm-600">
          Le vendeur verra ce motif et pourra corriger son produit pour le soumettre à nouveau.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Motif du refus (obligatoire)"
          className="mb-4 w-full rounded-lg border border-warm-300 p-3 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejecting(null)}>Annuler</Button>
          <Button loading={saving} disabled={reason.trim().length < 3} onClick={confirmReject}>
            Refuser le produit
          </Button>
        </div>
      </Modal>
    </div>
  );
}

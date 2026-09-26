'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PageHead } from '@/components/admin/AdminShell';
import { formatPrice, formatQuantity, getProductImage } from '@/lib/utils';
import {
  deleteSellerProduct,
  getSellerProducts,
  setSellerProductActive,
  updateSellerStock,
} from '@/lib/api/seller';
import type { Product, ProductStatus } from '@/types';

const statusStyle: Record<ProductStatus, { label: string; tone: string }> = {
  pending: { label: 'En attente de validation', tone: 'tone-warning' },
  approved: { label: 'Publié', tone: 'tone-success' },
  rejected: { label: 'Refusé', tone: 'tone-danger' },
};

type Filter = 'all' | ProductStatus;

function SellerProducts() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [notice, setNotice] = useState<string | null>(
    searchParams.get('saved') ? 'Produit enregistré : il sera visible dès sa validation par un administrateur.' : null
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setProducts((await getSellerProducts(token)).products);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger vos produits');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, message?: string) => {
    try {
      await action();
      if (message) setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible');
    }
  };

  const count = (status: ProductStatus) => products.filter((p) => (p.status ?? 'approved') === status).length;
  const visible = filter === 'all' ? products : products.filter((p) => (p.status ?? 'approved') === filter);
  const lowStock = products.filter((p) => (p.stockQuantity ?? 0) <= 10).length;

  const kpis = [
    { label: 'Produits', value: products.length, icon: 'bi-box-seam', tone: 'tone-accent' },
    { label: 'Publiés', value: count('approved'), icon: 'bi-check2-circle', tone: 'tone-success' },
    { label: 'En validation', value: count('pending'), icon: 'bi-hourglass-split', tone: 'tone-warning' },
    { label: 'Stock faible', value: lowStock, icon: 'bi-exclamation-triangle', tone: 'tone-danger' },
  ];

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'Tous', count: products.length },
    { key: 'approved', label: 'Publiés', count: count('approved') },
    { key: 'pending', label: 'En validation', count: count('pending') },
    { key: 'rejected', label: 'Refusés', count: count('rejected') },
  ];

  return (
    <>
      <PageHead
        title="Mes produits"
        crumbs={[{ label: 'Espace vendeur', href: '/vendeur' }, { label: 'Mes produits' }]}
        actions={
          <Link href="/vendeur/produits/nouveau" className="sw-btn btn-accent">
            <i className="bi bi-plus-lg"></i>Publier un produit
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`kpi-card ${kpi.tone}`}>
            <span className="kpi-icon"><i className={`bi ${kpi.icon}`}></i></span>
            <div>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{loading ? <span className="kpi-skeleton" /> : kpi.value}</div>
            </div>
          </div>
        ))}
      </div>

      {notice && (
        <div role="status" className="sw-alert tone-success mb-4">
          <i className="bi bi-check-circle"></i>
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="sw-alert tone-danger mb-4">
          <i className="bi bi-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      )}

      <section className="panel">
        <div className="order-tabs" role="tablist" aria-label="Filtrer par statut">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              className={`nav-link${filter === tab.key ? ' active' : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span className="tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="num">Prix</th>
                <th>Minimum</th>
                <th>Stock</th>
                <th>Statut</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="empty-row"><td colSpan={6}>Chargement…</td></tr>
              ) : visible.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6}>
                    {products.length === 0 ? "Vous n'avez encore publié aucun produit." : 'Aucun produit dans cette catégorie.'}
                  </td>
                </tr>
              ) : (
                visible.map((product) => {
                  const st = statusStyle[product.status ?? 'approved'];
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="prod-cell">
                          <Image src={getProductImage(product)} alt="" width={44} height={44} unoptimized />
                          <div>
                            <strong>{product.name}</strong>
                            <small>
                              {product.priceTiers.length > 0
                                ? `${product.priceTiers.length} palier${product.priceTiers.length > 1 ? 's' : ''} de prix`
                                : 'Vente en gros'}
                            </small>
                            {product.status === 'rejected' && product.rejectionReason && (
                              <small className="block !text-red-600">Motif du refus : {product.rejectionReason}</small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        <strong>{formatPrice(product.price)}</strong>
                        <small className="block">/ {product.unit}</small>
                      </td>
                      <td>{formatQuantity(product.moq, product.unit)}</td>
                      <td>
                        <StockEditor
                          product={product}
                          onSave={(qty) => run(() => updateSellerStock(product.id, qty, token!), 'Stock mis à jour')}
                        />
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span className={`pill ${st.tone}`}>{st.label}</span>
                          {product.status === 'approved' && product.isActive === false && (
                            <span className="pill tone-muted">Retiré de la vente</span>
                          )}
                        </div>
                      </td>
                      <td className="num">
                        <div className="row-actions">
                          <Link
                            href={`/vendeur/produits/${product.id}`}
                            aria-label={`Modifier ${product.name}`}
                            title="Modifier (repasse en validation)"
                          >
                            <i className="bi bi-pencil"></i>
                          </Link>
                          {product.status === 'approved' && (
                            <button
                              type="button"
                              aria-label={product.isActive === false ? `Remettre ${product.name} en vente` : `Retirer ${product.name} de la vente`}
                              title={product.isActive === false ? 'Remettre en vente' : 'Retirer de la vente'}
                              onClick={() => run(() => setSellerProductActive(product.id, product.isActive === false, token!))}
                            >
                              <i className={`bi ${product.isActive === false ? 'bi-eye' : 'bi-eye-slash'}`}></i>
                            </button>
                          )}
                          <button
                            type="button"
                            className="danger"
                            aria-label={`Supprimer ${product.name}`}
                            title="Supprimer"
                            onClick={() => {
                              if (window.confirm(`Supprimer « ${product.name} » ?`)) {
                                run(async () => {
                                  const res = await deleteSellerProduct(product.id, token!);
                                  setNotice(res.message);
                                });
                              }
                            }}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StockEditor({ product, onSave }: { product: Product; onSave: (qty: number) => void }) {
  const [value, setValue] = useState(String(product.stockQuantity ?? 0));
  const dirty = value !== String(product.stockQuantity ?? 0);
  const qty = Number(value) || 0;

  return (
    <div className="flex items-center gap-2">
      <div className="qty-stepper">
        <button type="button" aria-label="Retirer une unité" onClick={() => setValue(String(Math.max(0, qty - 1)))}>
          <i className="bi bi-dash"></i>
        </button>
        <input
          id={`stock-${product.id}`}
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Stock de ${product.name}`}
        />
        <button type="button" aria-label="Ajouter une unité" onClick={() => setValue(String(qty + 1))}>
          <i className="bi bi-plus"></i>
        </button>
      </div>
      {dirty && (
        <button type="button" onClick={() => onSave(qty)} className="sw-btn btn-accent !px-3 !py-1">
          OK
        </button>
      )}
    </div>
  );
}

export default function SellerProductsPage() {
  return (
    <Suspense fallback={<div className="panel h-40 animate-pulse" />}>
      <SellerProducts />
    </Suspense>
  );
}

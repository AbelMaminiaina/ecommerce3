'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/lib/utils';
import { getAllOrders } from '@/lib/api/checkout';
import { getProducts } from '@/lib/api/products';
import { listCompanies } from '@/lib/api/companies';

interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  status: string;
  total: number;
  createdAt: string;
  items?: Array<{ quantity: number }>;
}

interface Product {
  id: string;
  name: string;
  category: string;
  stockQuantity: number;
  images?: string[];
}

const LOW_STOCK_THRESHOLD = 10;

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const statusTones: Record<string, string> = {
  pending: 'tone-warning',
  confirmed: 'tone-info',
  processing: 'tone-info',
  shipped: 'tone-accent',
  delivered: 'tone-success',
  cancelled: 'tone-danger',
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function AdminDashboard() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pendingCompanies, setPendingCompanies] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const fetchData = async () => {
    // Commandes, produits et comptes à valider en parallèle ; un échec n'empêche pas d'afficher le reste
    const [ordersRes, productsRes, companiesRes] = await Promise.allSettled([
      getAllOrders<Order>(token!),
      getProducts(),
      listCompanies(token!, 'pending'),
    ]);

    if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value.orders || []);
    if (productsRes.status === 'fulfilled') {
      setProducts(productsRes.value.products.map((p) => ({ ...p, stockQuantity: p.stockQuantity ?? 0 })));
    }
    if (companiesRes.status === 'fulfilled') setPendingCompanies(companiesRes.value.total || 0);
    for (const res of [ordersRes, productsRes, companiesRes]) {
      if (res.status === 'rejected') console.error('Error fetching dashboard data:', res.reason);
    }
    setLoading(false);
  };

  // Ventes (hors commandes annulées) des 7 derniers jours, aujourd'hui en dernier
  const salesDays = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return { date: d, total: 0 };
    });
    const byKey = new Map(days.map((day) => [dayKey(day.date), day]));
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      const day = byKey.get(dayKey(new Date(order.createdAt)));
      if (day) day.total += order.total;
    }
    return days;
  }, [orders]);

  const revenue7d = salesDays.reduce((sum, day) => sum + day.total, 0);
  const maxDay = Math.max(...salesDays.map((day) => day.total), 1);
  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const lowStock = products
    .filter((p) => p.stockQuantity <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stockQuantity - b.stockQuantity);
  const outOfStock = lowStock.filter((p) => p.stockQuantity <= 0).length;
  const recentOrders = orders.slice(0, 6);

  const kpis = [
    {
      label: "Chiffre d'affaires (7 j)",
      value: formatPrice(revenue7d),
      icon: 'bi-cash-stack',
      tone: 'tone-accent',
      href: '/admin/commandes',
      trend: `${orders.length} commande${orders.length > 1 ? 's' : ''} au total`,
    },
    {
      label: 'Commandes en attente',
      value: String(pendingOrders),
      icon: 'bi-receipt',
      tone: 'tone-info',
      href: '/admin/commandes',
      trend: 'Traiter les commandes',
    },
    {
      label: 'Comptes à valider',
      value: String(pendingCompanies),
      icon: 'bi-building',
      tone: 'tone-warning',
      href: '/admin/entreprises',
      trend: 'Voir les entreprises',
    },
    {
      label: 'Alertes de stock',
      value: String(lowStock.length),
      icon: 'bi-exclamation-triangle',
      tone: 'tone-danger',
      href: '/admin/stocks',
      trend: `${outOfStock} en rupture · ${products.length} produits`,
    },
  ];

  const quickActions = [
    { label: 'Gérer les commandes', sub: `${pendingOrders} en attente`, href: '/admin/commandes', icon: 'bi-receipt', tone: 'tone-info' },
    { label: 'Valider les paiements', sub: 'Mobile Money', href: '/admin/paiements', icon: 'bi-phone', tone: 'tone-accent' },
    { label: 'Reversements vendeurs', sub: 'Commissions et virements', href: '/admin/reversements', icon: 'bi-wallet2', tone: 'tone-success' },
    { label: 'Gérer les catégories', sub: 'Arborescence du catalogue', href: '/admin/categories', icon: 'bi-tags', tone: 'tone-muted' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <nav aria-label="Fil d'Ariane">
            <ol className="breadcrumb">
              <li><Link href="/admin">Administration</Link></li>
              <li aria-current="page">Tableau de bord</li>
            </ol>
          </nav>
        </div>
        <div className="head-actions">
          <Link href="/admin/commandes" className="sw-btn btn-soft">
            <i className="bi bi-receipt"></i>Commandes
          </Link>
          <Link href="/admin/stocks" className="sw-btn btn-accent">
            <i className="bi bi-plus-lg"></i>Ajouter un produit
          </Link>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className={`kpi-card ${kpi.tone}`}>
            <span className="kpi-icon"><i className={`bi ${kpi.icon}`}></i></span>
            <div className="min-w-0">
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{loading ? <span className="kpi-skeleton" /> : kpi.value}</div>
              {!loading && <div className="kpi-trend">{kpi.trend}</div>}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Graphique des ventes */}
        <section className="panel xl:col-span-2">
          <div className="panel-head">
            <h2>Ventes des 7 derniers jours</h2>
            <span className="text-sm">Hors commandes annulées</span>
          </div>
          <div className="panel-body">
            <div className="sales-chart" role="img" aria-label="Histogramme des ventes quotidiennes">
              {salesDays.map((day) => (
                <div key={day.date.toISOString()} className="col-bar">
                  <div className="fill" style={{ height: `${(day.total / maxDay) * 85}%` }}>
                    <span className="tip">{formatPrice(day.total)}</span>
                  </div>
                  <small>{day.date.toLocaleDateString('fr-FR', { weekday: 'short' })}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stock à surveiller */}
        <section className="panel">
          <div className="panel-head">
            <h2>Stock à surveiller</h2>
            <Link href="/admin/stocks" className="sw-link">Réapprovisionner</Link>
          </div>
          <ul className="mini-list">
            {loading ? (
              <li className="empty">Chargement…</li>
            ) : lowStock.length === 0 ? (
              <li className="empty">Aucune alerte de stock</li>
            ) : (
              lowStock.slice(0, 5).map((p) => (
                <li key={p.id}>
                  {p.images?.[0] ? (
                    <Image src={p.images[0]} alt="" width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="move-icon tone-muted"><i className="bi bi-box-seam"></i></span>
                  )}
                  <div className="grow">
                    <strong>{p.name}</strong>
                    <small>{p.category}</small>
                  </div>
                  <span className={`pill ${p.stockQuantity <= 0 ? 'tone-danger' : 'tone-warning'}`}>
                    {p.stockQuantity <= 0 ? 'Rupture' : `${p.stockQuantity} restant${p.stockQuantity > 1 ? 's' : ''}`}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Dernières commandes */}
        <section className="panel xl:col-span-2">
          <div className="panel-head">
            <h2>Dernières commandes</h2>
            <Link href="/admin/commandes" className="sw-link">Toutes les commandes</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Commande</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th className="num">Articles</th>
                  <th className="num">Total</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="empty-row"><td colSpan={6}>Chargement…</td></tr>
                ) : recentOrders.length === 0 ? (
                  <tr className="empty-row"><td colSpan={6}>Aucune commande pour le moment</td></tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td><strong>{order.orderNumber}</strong></td>
                      <td>{order.companyName}</td>
                      <td>{new Date(order.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td className="num">{order.items?.reduce((n, item) => n + item.quantity, 0) ?? '–'}</td>
                      <td className="num"><strong>{formatPrice(order.total)}</strong></td>
                      <td>
                        <span className={`pill ${statusTones[order.status] || ''}`}>
                          {statusLabels[order.status] || order.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Actions rapides */}
        <section className="panel">
          <div className="panel-head">
            <h2>Actions rapides</h2>
          </div>
          <ul className="mini-list">
            {quickActions.map((action) => (
              <li key={action.href}>
                <span className={`move-icon ${action.tone}`}><i className={`bi ${action.icon}`}></i></span>
                <Link href={action.href} className="grow">
                  <strong>{action.label}</strong>
                  <small>{action.sub}</small>
                </Link>
                <i className="bi bi-chevron-right text-warm-400"></i>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { formatPrice } from '@/lib/utils';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { getAllOrders, updateOrderStatus as persistOrderStatus } from '@/lib/api/checkout';

interface Order {
  id: string;
  orderNumber: string;
  companyName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  status: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryMethod: string;
  paymentMethod?: string | null;
  paymentStatus?: 'awaiting' | 'submitted' | 'paid' | 'rejected';
  paymentReference?: string | null;
  paymentRejectionReason?: string | null;
  notes?: string;
  cancelReason?: string;
  createdAt: string;
  address?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    availableFrom?: string | null;
  }>;
}

const paymentMethodLabels: Record<string, string> = {
  mvola: 'MVola',
  orange_money: 'Orange Money',
  airtel_money: 'Airtel Money',
};

function isReservation(availableFrom?: string | null): boolean {
  if (!availableFrom) return false;
  const d = new Date(availableFrom);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmée', color: 'bg-blue-100 text-blue-800' },
  processing: { label: 'En préparation', color: 'bg-purple-100 text-purple-800' },
  shipped: { label: 'Expédiée', color: 'bg-indigo-100 text-indigo-800' },
  delivered: { label: 'Livrée', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-800' },
};

const deliveryLabels: Record<string, string> = {
  standard: 'Livraison standard',
  express: 'Livraison express',
  retrait: 'Retrait sur place',
};

export default function AdminOrdersPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (token) fetchOrders();
  }, [token]);

  const fetchOrders = async () => {
    try {
      const data = await getAllOrders<Order>(token!);
      setOrders(data.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string, reason?: string) => {
    setUpdatingStatus(true);
    try {
      await persistOrderStatus(orderId, newStatus, token!, reason);
      await fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus, ...(reason !== undefined ? { cancelReason: reason } : {}) });
      }
    } catch (error) {
      console.error('Error updating order:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const confirmCancelOrder = async () => {
    if (!selectedOrder) return;
    await updateOrderStatus(selectedOrder.id, 'cancelled', cancelReason.trim());
    setShowCancelDialog(false);
    setCancelReason('');
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        searchQuery === '' ||
        order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.contactEmail || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const orderStats = useMemo(() => {
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      processing: orders.filter((o) => ['confirmed', 'processing'].includes(o.status)).length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
      delivered: orders.filter((o) => o.status === 'delivered').length,
    };
  }, [orders]);

  const handlePrint = (order: Order) => {
    const printContent = `
      BON DE COMMANDE
      ===================================

      N° Commande: ${order.orderNumber}
      ${order.paymentMethod ? `Paiement: ${paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod} — ${order.paymentStatus === 'paid' ? 'confirmé' : 'non confirmé'}${order.paymentReference ? ` (réf. ${order.paymentReference})` : ''}` : ''}
      Date: ${new Date(order.createdAt).toLocaleDateString('fr-FR')}

      ENTREPRISE
      ------
      Nom: ${order.companyName}
      ${order.contactEmail ? `Email: ${order.contactEmail}` : ''}
      ${order.contactPhone ? `Téléphone: ${order.contactPhone}` : ''}

      ADRESSE DE LIVRAISON
      --------------------
      ${order.address ? `${order.address.street}
      ${order.address.postalCode} ${order.address.city}
      ${order.address.country}` : 'Non spécifiée'}

      Mode de livraison: ${deliveryLabels[order.deliveryMethod] || order.deliveryMethod}

      ARTICLES
      --------
      ${order.items.map((item) => `${item.name} x${item.quantity} - ${formatPrice(item.price * item.quantity)}${isReservation(item.availableFrom) ? ` (réservation - dispo le ${new Date(item.availableFrom!).toLocaleDateString('fr-FR')})` : ''}`).join('\n      ')}

      Sous-total: ${formatPrice(order.subtotal)}
      Frais de livraison: ${formatPrice(order.shippingCost)}
      TOTAL: ${formatPrice(order.total)}

      ${order.notes ? `Notes: ${order.notes}` : ''}
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<pre style="font-family: monospace; padding: 20px;">${printContent}</pre>`);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prairie-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-warm-800 mb-6">Gestion des commandes</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-warm-500">Total</p>
          <p className="text-2xl font-bold text-warm-800">{orderStats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-yellow-600">En attente</p>
          <p className="text-2xl font-bold text-yellow-800">{orderStats.pending}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-purple-600">En cours</p>
          <p className="text-2xl font-bold text-purple-800">{orderStats.processing}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-indigo-600">Expédiées</p>
          <p className="text-2xl font-bold text-indigo-800">{orderStats.shipped}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-green-600">Livrées</p>
          <p className="text-2xl font-bold text-green-800">{orderStats.delivered}</p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-warm-400 text-[20px] leading-none" aria-hidden="true" />
          <Input
            type="text"
            placeholder="Rechercher par n°, nom ou email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <i className="bi bi-funnel text-warm-400 text-[20px] leading-none" aria-hidden="true" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-prairie-500 focus:border-transparent outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="confirmed">Confirmées</option>
            <option value="processing">En préparation</option>
            <option value="shipped">Expédiées</option>
            <option value="delivered">Livrées</option>
            <option value="cancelled">Annulées</option>
          </select>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <p className="text-warm-600">
            {orders.length === 0
              ? 'Aucune commande pour le moment'
              : 'Aucune commande ne correspond à votre recherche'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-warm-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">
                    N° Commande
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">
                    Entreprise
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">
                    Livraison
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">
                    Statut
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">
                    Total
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">
                    Date
                  </th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-warm-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className={`hover:bg-warm-50 ${order.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4 text-sm font-medium text-warm-800">
                      {order.orderNumber}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-warm-800">
                        {order.companyName}
                      </p>
                      <p className="text-sm text-warm-500">{order.contactEmail}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600">
                      {deliveryLabels[order.deliveryMethod] || order.deliveryMethod}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          statusLabels[order.status]?.color || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {statusLabels[order.status]?.label || order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-warm-800">
                      {formatPrice(order.total)}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600">
                      {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="p-2 hover:bg-prairie-50 rounded-lg transition-colors"
                        title="Voir détails"
                      >
                        <i className="bi bi-eye text-prairie-600 text-[20px] leading-none" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-6xl my-2 md:my-4 max-h-[95vh] md:max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-warm-100 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-warm-800">
                    Commande {selectedOrder.orderNumber}
                  </h2>
                  <p className="text-sm text-warm-500">
                    {new Date(selectedOrder.createdAt).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrint(selectedOrder)}
                    className="p-2 hover:bg-warm-100 rounded-full"
                    title="Imprimer"
                  >
                    <i className="bi bi-printer text-warm-600 text-[20px] leading-none" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="p-2 hover:bg-warm-100 rounded-full"
                  >
                    <i className="bi bi-x-lg text-[20px] leading-none" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <span
                  className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                    statusLabels[selectedOrder.status]?.color || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusLabels[selectedOrder.status]?.label || selectedOrder.status}
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
              {/* Client info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <h3 className="font-semibold text-warm-800 mb-3 flex items-center gap-2">
                    <i className="bi bi-box-seam text-[16px] leading-none" aria-hidden="true" />
                    Entreprise
                  </h3>
                  <div className="space-y-1">
                    <p className="text-warm-700 font-medium">{selectedOrder.companyName}</p>
                    <p className="text-warm-600">{selectedOrder.contactEmail}</p>
                    {selectedOrder.contactPhone && (
                      <p className="text-warm-600 flex items-center gap-2">
                        <i className="bi bi-telephone text-[16px] leading-none" aria-hidden="true" />
                        {selectedOrder.contactPhone}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-warm-800 mb-3 flex items-center gap-2">
                    <i className="bi bi-geo-alt text-[16px] leading-none" aria-hidden="true" />
                    Adresse de livraison
                  </h3>
                  {selectedOrder.address ? (
                    <div className="space-y-1 text-warm-600">
                      <p>{selectedOrder.address.street}</p>
                      <p>{selectedOrder.address.postalCode} {selectedOrder.address.city}</p>
                      <p>{selectedOrder.address.country}</p>
                    </div>
                  ) : (
                    <p className="text-warm-500 italic">Non spécifiée</p>
                  )}
                </div>
              </div>

              {/* Delivery method */}
              <div className="bg-warm-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="bi bi-truck text-warm-600 text-[20px] leading-none" aria-hidden="true" />
                    <span className="font-medium text-warm-700">
                      {deliveryLabels[selectedOrder.deliveryMethod] || selectedOrder.deliveryMethod}
                    </span>
                  </div>
                  <span className="text-warm-600">
                    {selectedOrder.shippingCost > 0 ? formatPrice(selectedOrder.shippingCost) : 'Gratuit'}
                  </span>
                </div>
              </div>

              {/* Paiement Mobile Money */}
              {selectedOrder.paymentMethod && (
                <div className={`rounded-lg p-4 ${selectedOrder.paymentStatus === 'paid' ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <i className="bi bi-receipt text-warm-700 text-[20px] leading-none" aria-hidden="true" />
                      <span className="font-medium text-warm-800">
                        {paymentMethodLabels[selectedOrder.paymentMethod] ?? selectedOrder.paymentMethod}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-warm-700">
                      {selectedOrder.paymentStatus === 'paid'
                        ? 'Paiement confirmé'
                        : selectedOrder.paymentStatus === 'submitted'
                        ? 'Paiement à vérifier'
                        : selectedOrder.paymentStatus === 'rejected'
                        ? 'Paiement refusé'
                        : 'En attente de paiement'}
                    </span>
                  </div>
                  {selectedOrder.paymentReference && (
                    <p className="text-sm text-warm-600 mt-2">Référence : {selectedOrder.paymentReference}</p>
                  )}
                  {selectedOrder.paymentStatus !== 'paid' && (
                    <p className="text-xs text-warm-500 mt-2">
                      La commande ne peut avancer qu&apos;après confirmation du paiement (page « Paiements »).
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <h3 className="font-semibold text-warm-800 mb-2 flex items-center gap-2">
                    <i className="bi bi-file-text text-[16px] leading-none" aria-hidden="true" />
                    Notes
                  </h3>
                  <p className="text-warm-600 bg-warm-50 rounded-lg p-3">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Items */}
              <div>
                <h3 className="font-semibold text-warm-800 mb-3">Articles commandés</h3>
                <div className="space-y-2 bg-warm-50 rounded-lg p-4">
                  {selectedOrder.items.map((item, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center py-2 border-b border-warm-200 last:border-0"
                    >
                      <div>
                        <p className="text-warm-800 font-medium">{item.name}</p>
                        <p className="text-sm text-warm-500">
                          {formatPrice(item.price)} x {item.quantity}
                        </p>
                        {isReservation(item.availableFrom) && (
                          <p className="text-xs text-amber-600 font-medium mt-0.5">
                            📅 Réservation — livraison à partir du{' '}
                            {new Date(item.availableFrom!).toLocaleDateString('fr-FR', {
                              day: 'numeric', month: 'long', year: 'numeric',
                            })}
                          </p>
                        )}
                      </div>
                      <p className="font-semibold text-warm-800">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 text-right">
                  <div className="flex justify-between text-warm-600">
                    <span>Sous-total</span>
                    <span>{formatPrice(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-warm-600">
                    <span>Frais de livraison</span>
                    <span>{selectedOrder.shippingCost > 0 ? formatPrice(selectedOrder.shippingCost) : 'Gratuit'}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-prairie-600 pt-2 border-t border-warm-200">
                    <span>Total</span>
                    <span>{formatPrice(selectedOrder.total)}</span>
                  </div>
                </div>
              </div>

              {/* Status actions */}
              {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                <div className="pb-2">
                  <h3 className="font-semibold text-warm-800 mb-3">Changer le statut</h3>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    {selectedOrder.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'confirmed')}
                        icon={<i className="bi bi-check-lg text-[16px] leading-none" aria-hidden="true" />}
                        disabled={updatingStatus}
                      >
                        Confirmer
                      </Button>
                    )}
                    {['pending', 'confirmed'].includes(selectedOrder.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'processing')}
                        disabled={updatingStatus}
                      >
                        En préparation
                      </Button>
                    )}
                    {['confirmed', 'processing'].includes(selectedOrder.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'shipped')}
                        icon={<i className="bi bi-truck text-[16px] leading-none" aria-hidden="true" />}
                        disabled={updatingStatus}
                      >
                        Expédier
                      </Button>
                    )}
                    {selectedOrder.status === 'shipped' && (
                      <Button
                        size="sm"
                        onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                        disabled={updatingStatus}
                      >
                        Marquer livrée
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCancelReason('');
                        setShowCancelDialog(true);
                      }}
                      icon={<i className="bi bi-slash-circle text-[16px] leading-none" aria-hidden="true" />}
                      className="text-red-600 border-red-300 hover:bg-red-50 col-span-2 sm:col-span-1"
                      disabled={updatingStatus}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {selectedOrder.status === 'cancelled' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-red-700 font-medium">Cette commande a été annulée</p>
                  {selectedOrder.cancelReason && (
                    <p className="text-red-600 text-sm mt-2">
                      Motif : {selectedOrder.cancelReason}
                    </p>
                  )}
                </div>
              )}

              {selectedOrder.status === 'delivered' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-700 font-medium">Cette commande a été livrée avec succès</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel reason dialog */}
      <Modal
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        title="Annuler la commande"
        size="sm"
        closeOnOverlayClick={!updatingStatus}
        closeOnEscape={!updatingStatus}
      >
        <div className="space-y-4">
          <p className="text-warm-600 text-sm">
            {selectedOrder && (
              <>
                Commande <span className="font-medium text-warm-800">{selectedOrder.orderNumber}</span> —
                cette action est irréversible.
              </>
            )}
          </p>
          <Textarea
            label="Motif de l'annulation"
            placeholder="Ex : rupture de stock, adresse invalide..."
            helperText="Ce motif sera envoyé au client par email."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCancelDialog(false)}
              disabled={updatingStatus}
            >
              Retour
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<i className="bi bi-slash-circle text-[16px] leading-none" aria-hidden="true" />}
              onClick={confirmCancelOrder}
              loading={updatingStatus}
            >
              Confirmer l&apos;annulation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

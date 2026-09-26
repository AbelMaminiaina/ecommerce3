'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Modal, Select, Input } from '@/components/ui';
import { listCompanies, approveCompany, rejectCompany } from '@/lib/api/companies';
import { Company } from '@/types';

type CompanyWithUsers = Company & {
  users: { id: string; email: string; firstName: string; lastName: string; role: string }[];
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approuvée', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejetée', color: 'bg-red-100 text-red-800' },
  suspended: { label: 'Suspendue', color: 'bg-gray-100 text-gray-800' },
};

export default function AdminEntreprisesPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [companies, setCompanies] = useState<CompanyWithUsers[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [approveModal, setApproveModal] = useState<CompanyWithUsers | null>(null);
  const [rejectModal, setRejectModal] = useState<CompanyWithUsers | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCompanies = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await listCompanies(token, statusFilter === 'all' ? undefined : statusFilter);
      setCompanies(data.companies);
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleApprove = async () => {
    if (!approveModal || !token) return;
    setSaving(true);
    try {
      await approveCompany(approveModal.id, token);
      setApproveModal(null);
      await fetchCompanies();
    } catch (error) {
      console.error('Error approving company:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !token) return;
    setSaving(true);
    try {
      await rejectCompany(rejectModal.id, rejectReason || undefined, token);
      setRejectModal(null);
      setRejectReason('');
      await fetchCompanies();
    } catch (error) {
      console.error('Error rejecting company:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-warm-800 mb-6">Comptes professionnels</h1>

      <div className="flex items-center gap-2 mb-6">
        {['pending', 'approved', 'rejected', 'suspended', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-prairie-600 text-white'
                : 'bg-white text-warm-600 hover:bg-warm-100'
            }`}
          >
            {s === 'all' ? 'Toutes' : statusLabels[s]?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prairie-600"></div>
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <i className="bi bi-building text-warm-300 mx-auto mb-4 text-[48px] leading-none" aria-hidden="true" />
          <p className="text-warm-600">Aucune entreprise dans cette catégorie</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-warm-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">Entreprise</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">Contact</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">NIF</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-warm-700">Statut</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-warm-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-100">
                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-warm-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-warm-800">{company.name}</p>
                      {company.users[0] && (
                        <p className="text-xs text-warm-500">
                          {company.users[0].firstName} {company.users[0].lastName}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600">
                      <p className="flex items-center gap-1"><i className="bi bi-envelope text-[14px] leading-none" aria-hidden="true" />{company.contactEmail}</p>
                      {company.contactPhone && (
                        <p className="flex items-center gap-1 mt-0.5"><i className="bi bi-telephone text-[14px] leading-none" aria-hidden="true" />{company.contactPhone}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 flex items-center gap-1">
                      <i className="bi bi-hash text-[14px] leading-none" aria-hidden="true" />{company.taxId}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusLabels[company.status]?.color}`}>
                        {statusLabels[company.status]?.label || company.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {company.status === 'pending' && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            icon={<i className="bi bi-check-lg text-[16px] leading-none" aria-hidden="true" />}
                            onClick={() => setApproveModal(company)}
                          >
                            Approuver
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50"
                            icon={<i className="bi bi-x-lg text-[16px] leading-none" aria-hidden="true" />}
                            onClick={() => setRejectModal(company)}
                          >
                            Rejeter
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approve modal */}
      <Modal
        isOpen={!!approveModal}
        onClose={() => setApproveModal(null)}
        title="Approuver l'entreprise"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-warm-600 text-sm">
            {approveModal && (
              <>Approuver <span className="font-medium text-warm-800">{approveModal.name}</span> : l&apos;entreprise pourra commander au tarif de gros et publier ses produits (après validation de chaque produit).</>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setApproveModal(null)} disabled={saving}>
              Annuler
            </Button>
            <Button size="sm" onClick={handleApprove} loading={saving}>
              Confirmer l&apos;approbation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title="Rejeter la demande"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-warm-600 text-sm">
            {rejectModal && (
              <>Rejeter la demande de <span className="font-medium text-warm-800">{rejectModal.name}</span>.</>
            )}
          </p>
          <Input
            label="Motif (optionnel)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ex: documents manquants"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectModal(null)} disabled={saving}>
              Annuler
            </Button>
            <Button variant="danger" size="sm" onClick={handleReject} loading={saving}>
              Confirmer le rejet
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

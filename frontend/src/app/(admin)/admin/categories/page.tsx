'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Input } from '@/components/ui';
import { deleteCategory, getCategories, saveCategory as persistCategory } from '@/lib/api/categories';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  order: number;
  isActive: boolean;
  _count?: {
    products: number;
  };
}


export default function AdminCategoriesPage() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; category?: Category } | null>(null);
  const [form, setForm] = useState({ name: '', description: '', image: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation modal
  const [deleteModal, setDeleteModal] = useState<{ category: Category } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await getCategories<Category>();
      setCategories(data.categories || []);
    } catch (e) {
      console.error('Error:', e);
    } finally {
      setLoading(false);
    }
  };

  // Open modal
  const openModal = (mode: 'add' | 'edit', category?: Category) => {
    if (mode === 'edit' && category) {
      setForm({
        name: category.name,
        description: category.description || '',
        image: category.image || '',
        isActive: category.isActive,
      });
    } else {
      setForm({ name: '', description: '', image: '', isActive: true });
    }
    setError(null);
    setModal({ mode, category });
  };

  // Save category
  const saveCategory = async () => {
    if (!form.name.trim()) {
      setError('Le nom est requis');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isEdit = modal?.mode === 'edit';
      await persistCategory(
        {
          name: form.name,
          description: form.description || null,
          image: form.image || null,
          isActive: form.isActive,
        },
        token!,
        isEdit ? modal.category?.id : undefined
      );
      await fetchCategories();
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Open delete modal
  const openDeleteModal = (category: Category) => {
    setDeleteModal({ category });
  };

  // Confirm delete category
  const confirmDelete = async () => {
    if (!deleteModal) return;

    const { category } = deleteModal;
    const productCount = category._count?.products || 0;

    // Check if category has products
    if (productCount > 0) {
      setToast({
        type: 'error',
        message: `Impossible de supprimer : ${productCount} produit(s) lié(s)`
      });
      setDeleteModal(null);
      return;
    }

    setDeleting(true);
    try {
      await deleteCategory(category.id, token!);
      setCategories(prev => prev.filter(c => c.id !== category.id));
      setToast({
        type: 'success',
        message: `"${category.name}" supprimée avec succès`
      });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur lors de la suppression' });
    } finally {
      setDeleting(false);
      setDeleteModal(null);
    }
  };

  // Toggle active status
  const toggleActive = async (category: Category) => {
    try {
      await persistCategory(
        {
          name: category.name,
          description: category.description ?? null,
          image: category.image ?? null,
          isActive: !category.isActive,
        },
        token!,
        category.id
      );
      setCategories(prev =>
        prev.map(c => c.id === category.id ? { ...c, isActive: !c.isActive } : c)
      );
    } catch (e) {
      console.error('Error:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-prairie-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-warm-800">Gestion des catégories</h1>
        <Button onClick={() => openModal('add')} icon={<i className="bi bi-plus-lg text-[16px] leading-none" aria-hidden="true" />}>
          <span className="hidden sm:inline">Ajouter</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-sm text-warm-500">Total</p>
          <p className="text-2xl font-bold text-warm-800">{categories.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow-sm">
          <p className="text-sm text-green-600">Actives</p>
          <p className="text-2xl font-bold text-green-700">
            {categories.filter(c => c.isActive).length}
          </p>
        </div>
      </div>

      {/* Categories list */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead className="bg-warm-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-warm-700">Catégorie</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-warm-700">Slug</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-warm-700">Produits</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-warm-700">Statut</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-warm-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {categories.map(category => (
                <tr key={category.id} className={!category.isActive ? 'bg-warm-50 opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-prairie-100 flex items-center justify-center shrink-0">
                        <i className="bi bi-folder text-prairie-600 text-[20px] leading-none" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="font-medium text-warm-800">{category.name}</p>
                        {category.description && (
                          <p className="text-xs text-warm-500 truncate max-w-[200px]">
                            {category.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-warm-600 font-mono">{category.slug}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-warm-100 text-warm-700 text-sm">
                      <i className="bi bi-box-seam text-[12px] leading-none" aria-hidden="true" />
                      {category._count?.products || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(category)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                        category.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-warm-200 text-warm-500'
                      }`}
                    >
                      {category.isActive ? (
                        <>
                          <i className="bi bi-eye text-[12px] leading-none" aria-hidden="true" /> Visible
                        </>
                      ) : (
                        <>
                          <i className="bi bi-eye-slash text-[12px] leading-none" aria-hidden="true" /> Masquée
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openModal('edit', category)}
                        className="p-2 hover:bg-warm-100 rounded"
                      >
                        <i className="bi bi-pencil text-prairie-600 text-[16px] leading-none" aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(category)}
                        className="p-2 hover:bg-red-50 rounded"
                      >
                        <i className="bi bi-trash text-red-600 text-[16px] leading-none" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {categories.length === 0 && (
          <p className="p-8 text-center text-warm-500">Aucune catégorie</p>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-warm-800">
                {modal.mode === 'edit' ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </h2>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-warm-100 rounded-lg">
                <i className="bi bi-x-lg text-[20px] leading-none" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-warm-700 mb-1">
                  Nom de la catégorie *
                </label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Oeufs frais"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-warm-700 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-warm-300 rounded-lg focus:ring-2 focus:ring-prairie-500 outline-none resize-none"
                  placeholder="Description optionnelle..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-warm-700 mb-1">
                  Image (URL)
                </label>
                <Input
                  value={form.image}
                  onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border-warm-300 text-prairie-600 focus:ring-prairie-500"
                />
                <label htmlFor="isActive" className="text-sm text-warm-700">
                  Catégorie visible sur le site
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-warm-50 rounded-b-2xl">
              <Button variant="outline" onClick={() => setModal(null)}>
                Annuler
              </Button>
              <Button onClick={saveCategory} loading={saving} disabled={!form.name.trim()}>
                {modal.mode === 'edit' ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Icon */}
            <div className="pt-6 pb-2 flex justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                (deleteModal.category._count?.products || 0) > 0 ? 'bg-amber-100' : 'bg-red-100'
              }`}>
                {(deleteModal.category._count?.products || 0) > 0 ? (
                  <i className="bi bi-exclamation-triangle text-amber-600 text-[32px] leading-none" aria-hidden="true" />
                ) : (
                  <i className="bi bi-trash text-red-600 text-[32px] leading-none" aria-hidden="true" />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4 text-center">
              <h3 className="text-xl font-bold text-warm-800 mb-2">
                {(deleteModal.category._count?.products || 0) > 0 ? 'Suppression impossible' : 'Confirmer la suppression'}
              </h3>

              {(deleteModal.category._count?.products || 0) > 0 ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <p className="text-amber-800 font-medium mb-1">
                      Cette catégorie contient {deleteModal.category._count?.products} produit{(deleteModal.category._count?.products || 0) > 1 ? 's' : ''}
                    </p>
                    <p className="text-amber-700 text-sm">
                      Vous devez d&apos;abord déplacer ou supprimer les produits de cette catégorie avant de pouvoir la supprimer.
                    </p>
                  </div>
                  <p className="text-warm-600">
                    <span className="font-semibold text-warm-800">&quot;{deleteModal.category.name}&quot;</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-warm-600">
                    Voulez-vous vraiment supprimer la catégorie{' '}
                    <span className="font-semibold text-warm-800">&quot;{deleteModal.category.name}&quot;</span> ?
                  </p>
                  <p className="text-sm text-warm-500 mt-2">
                    Cette action est irréversible.
                  </p>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 py-4 bg-warm-50">
              <Button
                variant="outline"
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="flex-1"
              >
                {(deleteModal.category._count?.products || 0) > 0 ? 'Fermer' : 'Annuler'}
              </Button>
              {(deleteModal.category._count?.products || 0) === 0 && (
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {deleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-trash text-[16px] leading-none" aria-hidden="true" />
                      Supprimer
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className={`flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            {toast.type === 'success' ? (
              <i className="bi bi-check-circle shrink-0 text-[20px] leading-none" aria-hidden="true" />
            ) : (
              <i className="bi bi-x-circle shrink-0 text-[20px] leading-none" aria-hidden="true" />
            )}
            <span className="font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <i className="bi bi-x-lg text-[16px] leading-none" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email ou mot de passe incorrect');
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="admin-sidebar !static !w-auto !bg-transparent !transform-none mb-4">
          <div className="brand justify-center !border-0">
            <i className="bi bi-cart2"></i>
            <span className="sitename">Tsena</span>
            <span className="brand-tag">Admin</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-prairie-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="bi bi-lock text-prairie-600 text-[32px] leading-none" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-warm-800">Admin</h1>
            <p className="text-warm-600 mt-1">Connexion au tableau de bord</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Email
              </label>
              <div className="relative">
                <i className="bi bi-envelope absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-warm-400 text-[20px] leading-none" aria-hidden="true" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <i className="bi bi-lock absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-warm-400 text-[20px] leading-none" aria-hidden="true" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" fullWidth loading={loading}>
              Se connecter
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

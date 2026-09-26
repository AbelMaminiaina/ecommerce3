'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { blogPosts } from '@/data/blog';
import type { BlogCategory } from '@/types';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shop/PageHeader';
import { BLOG_CATEGORY_LABELS } from '@/components/shopwise/blog';

const FILTERS: { value: BlogCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'conseils', label: BLOG_CATEGORY_LABELS.conseils },
  { value: 'tendances', label: BLOG_CATEGORY_LABELS.tendances },
  { value: 'guides', label: BLOG_CATEGORY_LABELS.guides },
  { value: 'actualites', label: BLOG_CATEGORY_LABELS.actualites },
];

// Blog du template ShopWise (blog.html) : filtres en onglets soulignés, article à la une puis grille de cartes.
export default function BlogPage() {
  const [category, setCategory] = useState<BlogCategory | 'all'>('all');

  const posts = useMemo(
    () =>
      blogPosts
        .filter((post) => category === 'all' || post.category === category)
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    [category]
  );
  const [featured, ...others] = posts;

  return (
    <>
      <PageHeader title="Blog" crumbs={[{ label: 'Blog' }]} />

      <section id="blog" className="sw-section sw-blog">
        <div className="container">
          <div className="blog-filter">
            <ul className="nav" role="tablist" aria-label="Filtrer les articles">
              {FILTERS.map((filter) => (
                <li key={filter.value} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={category === filter.value}
                    className={`nav-link${category === filter.value ? ' active' : ''}`}
                    onClick={() => setCategory(filter.value)}
                  >
                    {filter.label}
                  </button>
                </li>
              ))}
            </ul>
            <span className="blog-count">
              {posts.length} article{posts.length > 1 ? 's' : ''}
            </span>
          </div>

          {!featured ? (
            <div className="sw-empty">
              <i className="bi bi-journal-x"></i>
              <h2>Aucun article dans cette catégorie</h2>
              <p>Revenez bientôt ou consultez les autres catégories.</p>
            </div>
          ) : (
            <>
              <Link href={`/blog/${featured.slug}`} className="blog-featured row g-0 mb-5">
                <div className="col-lg-7">
                  <div className="blog-featured-img">
                    <Image src={featured.coverImage} alt={featured.title} fill sizes="(max-width: 992px) 100vw, 58vw" priority />
                  </div>
                </div>
                <div className="col-lg-5 d-flex">
                  <div className="blog-featured-body">
                    <span className="blog-badge">À la une · {BLOG_CATEGORY_LABELS[featured.category]}</span>
                    <h2>{featured.title}</h2>
                    <p>{featured.excerpt}</p>
                    <div className="blog-meta">
                      <span><i className="bi bi-calendar3"></i>{formatDate(featured.publishedAt)}</span>
                      <span><i className="bi bi-clock"></i>{featured.readingTime} min</span>
                    </div>
                    <span className="blog-btn">
                      Lire l&apos;article <i className="bi bi-arrow-right"></i>
                    </span>
                  </div>
                </div>
              </Link>

              {others.length > 0 && (
                <div className="row g-4">
                  {others.map((post) => (
                    <div key={post.id} className="col-lg-4 col-md-6">
                      <Link href={`/blog/${post.slug}`} className="blog-card">
                        <div className="blog-card-img">
                          <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, (max-width: 992px) 50vw, 33vw" />
                          <span className="blog-tag">{BLOG_CATEGORY_LABELS[post.category]}</span>
                        </div>
                        <div className="blog-card-body">
                          <div className="blog-meta">
                            <span><i className="bi bi-calendar3"></i>{formatDate(post.publishedAt)}</span>
                            <span><i className="bi bi-clock"></i>{post.readingTime} min</span>
                          </div>
                          <h3>{post.title}</h3>
                          <p>{post.excerpt}</p>
                          <span className="blog-card-action">
                            Lire la suite <i className="bi bi-arrow-right"></i>
                          </span>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

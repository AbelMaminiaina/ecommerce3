'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { blogPosts, getBlogPostBySlug } from '@/data/blog';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shop/PageHeader';
import { RichText } from '@/components/shopwise/RichText';
import { BLOG_CATEGORY_LABELS } from '@/components/shopwise/blog';

// Article du blog du template ShopWise (blog-details.html) : carte d'article (image, méta, contenu,
// étiquettes, partage) et colonne latérale (auteur, articles récents, newsletter).
export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const post = getBlogPostBySlug(slug);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(window.location.href.split('#')[0]);
  }, []);

  if (!post) {
    return (
      <>
        <PageHeader title="Article introuvable" crumbs={[{ label: 'Blog', href: '/blog' }, { label: 'Article introuvable' }]} />
        <section className="sw-section">
          <div className="container">
            <div className="sw-empty">
              <i className="bi bi-journal-x"></i>
              <h2>Cet article n&apos;existe pas ou a été retiré</h2>
              <p>Retrouvez tous nos conseils et actualités sur le blog.</p>
              <Link href="/blog" className="sw-btn-primary">Retour au blog</Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  const recentPosts = blogPosts
    .filter((p) => p.id !== post.id)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 3);
  const categoryLabel = BLOG_CATEGORY_LABELS[post.category];
  const encodedUrl = encodeURIComponent(shareUrl);

  return (
    <>
      <PageHeader title={post.title} crumbs={[{ label: 'Blog', href: '/blog' }, { label: categoryLabel }]} />

      <section id="blog-details" className="sw-section sw-blog">
        <div className="container">
          <div className="row g-4">
            <div className="col-lg-8">
              <article className="blog-article">
                <div className="blog-article-cover">
                  <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 992px) 100vw, 66vw" priority />
                  <span className="blog-tag">{categoryLabel}</span>
                </div>
                <div className="blog-article-body">
                  <div className="blog-meta">
                    <span><i className="bi bi-person"></i>{post.author.name}</span>
                    <span><i className="bi bi-calendar3"></i>{formatDate(post.publishedAt)}</span>
                    <span><i className="bi bi-clock"></i>{post.readingTime} min de lecture</span>
                  </div>
                  <p className="blog-lead">{post.excerpt}</p>
                  <RichText content={post.content} skipFirstTitle className="blog-content" />

                  <div className="blog-article-footer">
                    <div className="blog-tags">
                      {post.tags.map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                    <div className="blog-share">
                      <span>Partager :</span>
                      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Partager sur Facebook">
                        <i className="bi bi-facebook"></i>
                      </a>
                      <a href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" aria-label="Partager sur X">
                        <i className="bi bi-twitter-x"></i>
                      </a>
                      <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" aria-label="Partager sur LinkedIn">
                        <i className="bi bi-linkedin"></i>
                      </a>
                    </div>
                  </div>
                </div>
              </article>
              <Link href="/blog" className="blog-back">
                <i className="bi bi-arrow-left"></i> Retour au blog
              </Link>
            </div>

            <aside className="col-lg-4">
              <div className="blog-widget">
                <h4>À propos de l&apos;auteur</h4>
                <div className="blog-author">
                  <span className="blog-avatar" aria-hidden="true">{post.author.name.charAt(0).toUpperCase()}</span>
                  <div>
                    <strong>{post.author.name}</strong>
                    {(post.author.role || post.author.bio) && <small>{post.author.role || post.author.bio}</small>}
                  </div>
                </div>
              </div>

              {recentPosts.length > 0 && (
                <div className="blog-widget">
                  <h4>Articles récents</h4>
                  <div className="blog-related">
                    {recentPosts.map((related) => (
                      <Link key={related.id} href={`/blog/${related.slug}`} className="blog-related-item">
                        <span className="blog-related-img">
                          <Image src={related.coverImage} alt="" fill sizes="64px" />
                        </span>
                        <span>
                          <strong>{related.title}</strong>
                          <small>{formatDate(related.publishedAt)}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="blog-widget blog-cta">
                <span className="blog-badge">Newsletter</span>
                <h4>Ne manquez aucun article</h4>
                <p>Conseils, tendances et offres exclusives, une fois par mois dans votre boîte mail.</p>
                <a href="#footer" className="blog-btn">
                  Je m&apos;abonne <i className="bi bi-arrow-right"></i>
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

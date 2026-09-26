'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 motion-reduce:transition-none motion-reduce:transform-none disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary:
        'bg-electro-primary text-white hover:bg-electro-secondary focus-visible:ring-electro-primary shadow-md hover:shadow-lg active:shadow-sm',
      secondary:
        'bg-terre-500 text-white hover:bg-terre-600 focus-visible:ring-terre-400 shadow-md hover:shadow-lg',
      outline:
        'border-2 border-electro-primary text-electro-primary hover:bg-electro-light focus-visible:ring-electro-primary',
      ghost:
        'text-electro-primary hover:bg-electro-light focus-visible:ring-electro-primary',
      danger:
        'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-md hover:shadow-lg',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-4 py-2 text-base gap-2',
      lg: 'px-6 py-3 text-lg gap-2',
      xl: 'px-8 py-4 text-xl gap-3',
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <i className="bi bi-arrow-repeat animate-spin text-[16px] inline-block leading-none" aria-hidden="true" />
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span className="shrink-0">{icon}</span>
        )}
        {loading && loadingText ? loadingText : children}
        {!loading && icon && iconPosition === 'right' && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

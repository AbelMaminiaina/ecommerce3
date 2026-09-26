'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className="flex items-start">
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={cn(
              'peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded border border-warm-300',
              'checked:bg-electro-primary checked:border-electro-primary',
              'focus:outline-none focus:ring-2 focus:ring-electro-primary focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-colors duration-200',
              error && 'border-red-500',
              className
            )}
            {...props}
          />
          <i className="bi bi-check-lg absolute left-0.5 top-0.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity text-[16px] leading-none" aria-hidden="true" />
        </div>
        {label && (
          <label
            htmlFor={checkboxId}
            className={cn(
              'ml-2 text-sm text-warm-700 cursor-pointer select-none',
              props.disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {label}
          </label>
        )}
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

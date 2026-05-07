'use client';

import React from 'react';
import { Star, Sparkles, Crown } from 'lucide-react';

export type BadgeVariant = 'popular' | 'new' | 'free' | 'premium';

const variantStyles: Record<BadgeVariant, string> = {
  popular: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/50 dark:text-violet-300 dark:border-violet-700',
  new:     'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
  free:    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800',
  premium: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800',
};

const BadgeIcon: Record<BadgeVariant, React.FC<{ className?: string }>> = {
  popular: ({ className }) => <Star className={className} />,
  new:     ({ className }) => <Sparkles className={className} />,
  free:    ({ className }) => <span className={className}>✓</span>,
  premium: ({ className }) => <Crown className={className} />,
};

export interface ToolBadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

export function ToolBadge({ variant, label, className = '' }: ToolBadgeProps) {
  const Icon = BadgeIcon[variant];
  const defaultLabels: Record<BadgeVariant, string> = {
    popular: 'Popular',
    new: 'New',
    free: 'Free',
    premium: 'Premium',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {label ?? defaultLabels[variant]}
    </span>
  );
}

export default ToolBadge;

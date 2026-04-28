import type { CSSProperties } from 'react';

/**
 * Shimmer loading placeholder. Shape/spacing come from CSS classes defined in
 * design-system.css:
 *   .skeleton         — base shimmer block
 *   .skeleton-title   — big number-shaped placeholder (3rem × 1.5rem, centered)
 *   .skeleton-line    — text-width line
 *   .skeleton-line-sm — narrower sub-text line
 *   .skeleton-card    — full attention-row card with shimmer content
 *
 * Prefer the variant classes for consistency; pass `style` only when a
 * one-off width/height is needed.
 */
interface Props {
  variant?: 'base' | 'title' | 'line' | 'line-sm';
  style?: CSSProperties;
  className?: string;
  'aria-label'?: string;
}

export function Skeleton({ variant = 'base', style, className, ...a11y }: Props) {
  const variantClass =
    variant === 'title' ? 'skeleton skeleton-title' :
    variant === 'line' ? 'skeleton skeleton-line' :
    variant === 'line-sm' ? 'skeleton skeleton-line-sm' :
    'skeleton';
  return (
    <span
      className={`${variantClass}${className ? ` ${className}` : ''}`}
      style={style}
      role="status"
      aria-busy="true"
      aria-label={a11y['aria-label'] ?? 'Loading'}
    />
  );
}

/**
 * A shimmering replacement for an attention-row card. Used while the data
 * needed to compute the attention list hasn't resolved yet.
 */
export function SkeletonAttentionRow() {
  return (
    <div className="skeleton-card" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <Skeleton variant="line" style={{ width: '35%' }} />
        <Skeleton variant="line-sm" style={{ width: '65%' }} />
      </div>
    </div>
  );
}

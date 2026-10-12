'use client';

import { useState } from 'react';
import { initials } from '@/lib/format';
import { cx } from './ui';

const SIZES = {
  sm: 'size-6 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-14 text-base',
  xl: 'size-24 text-2xl',
} as const;

/** One avatar for every surface. The image comes through the API (private storage); ?v= busts the cache. */
export function Avatar({
  userId,
  name,
  avatarVersion,
  size = 'md',
  className,
}: {
  userId: string;
  name: string;
  avatarVersion: number | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const key = `${userId}:${avatarVersion ?? ''}`;
  const [lastKey, setLastKey] = useState(key);
  // A new avatar version should get a fresh attempt even if the previous one failed.
  if (key !== lastKey) {
    setLastKey(key);
    setFailed(false);
  }
  const showImage = !!avatarVersion && !failed;

  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-3 font-semibold', SIZES[size], className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the API, not a static asset
        <img src={`/api/users/${userId}/avatar?v=${avatarVersion}`} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

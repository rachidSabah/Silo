'use client';

interface PageTypeBadgeProps {
  type: string;
  size?: 'sm' | 'md';
}

const typeColors: Record<string, string> = {
  pillar: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  cluster: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  blog: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  category: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  landing: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export default function PageTypeBadge({ type, size = 'sm' }: PageTypeBadgeProps) {
  const colorClass = typeColors[type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${colorClass} ${sizeClass}`}>
      {type}
    </span>
  );
}

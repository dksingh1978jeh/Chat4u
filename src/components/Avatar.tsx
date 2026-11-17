import React from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  isGroup?: boolean;
}

const sizeMap = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const palette = [
  'bg-emerald-600 text-white',
  'bg-teal-600 text-white',
  'bg-cyan-700 text-white',
  'bg-indigo-600 text-white',
  'bg-amber-600 text-white',
  'bg-rose-600 text-white',
];

function getInitials(name: string): string {
  const parts = (name || 'U').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  online,
  isGroup,
}) => {
  const colorClass = palette[(name?.charCodeAt(0) || 0) % palette.length];
  return (
    <div className={`relative shrink-0 inline-flex items-center justify-center rounded-full select-none ${sizeMap[size]}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-full border border-slate-200 dark:border-slate-700"
        />
      ) : (
        <div
          className={`w-full h-full rounded-full flex items-center justify-center font-semibold tracking-tight ${
            isGroup ? 'bg-emerald-700 text-white' : colorClass
          }`}
        >
          {getInitials(name)}
        </div>
      )}
      {online && (
        <span
          title="Online"
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#111B21]"
        />
      )}
    </div>
  );
};

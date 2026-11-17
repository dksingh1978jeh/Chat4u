import type React from 'react';

export interface WallpaperPreset {
  id: string;
  label: string;
  description: string;
  url?: string;
  bg?: string;
}

export const WALLPAPER_GALLERY: WallpaperPreset[] = [
  {
    id: 'default',
    label: 'Clean Neutral',
    description: 'Uses your global default or clean SmartConnect theme',
  },
  {
    id: 'botanical',
    label: 'Botanical Mist',
    description: 'Soft sage botanical leaves',
    url: '/src/assets/images/wallpaper_botanical_mist_1794902760920.jpg',
  },
  {
    id: 'midnight',
    label: 'Midnight Topo',
    description: 'Dark topographic contour lines',
    url: '/src/assets/images/wallpaper_midnight_topo_1794902759621.jpg',
  },
  {
    id: 'dunes',
    label: 'Desert Dunes',
    description: 'Warm minimalist sand ripples',
    url: '/src/assets/images/wallpaper_desert_dunes_1794906817457.jpg',
  },
  {
    id: 'silk',
    label: 'Emerald Silk',
    description: 'Flowing deep emerald silk waves',
    url: '/src/assets/images/wallpaper_emerald_silk_1794906818207.jpg',
  },
  {
    id: 'emerald',
    label: 'Soft Sage',
    description: 'Calm mint-tinted solid backdrop',
    bg: '#E7F3EC',
  },
  {
    id: 'slate',
    label: 'Deep Slate',
    description: 'High-contrast dark slate canvas',
    bg: '#0F172A',
  },
];

export function isImageUrlWallpaper(value?: string | null): boolean {
  if (!value) return false;
  return (
    value.startsWith('/uploads/') ||
    value.startsWith('/src/assets/') ||
    value.startsWith('https://') ||
    value.startsWith('http://') ||
    value.startsWith('data:image/')
  );
}

export function resolveWallpaperStyle(
  wallpaper?: string | null,
  defaultWallpaper?: string | null
): React.CSSProperties {
  const effective =
    wallpaper && wallpaper !== 'default'
      ? wallpaper
      : defaultWallpaper && defaultWallpaper !== 'default'
        ? defaultWallpaper
        : 'default';

  const preset = WALLPAPER_GALLERY.find((w) => w.id === effective);
  if (preset) {
    if (preset.url) {
      return {
        backgroundImage: `url(${preset.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (preset.bg) {
      return { backgroundColor: preset.bg };
    }
    return {};
  }

  if (isImageUrlWallpaper(effective)) {
    return {
      backgroundImage: `url("${effective}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }

  if (effective.startsWith('#')) {
    return { backgroundColor: effective };
  }

  return {};
}

export function getWallpaperLabel(wallpaper?: string | null): string {
  if (!wallpaper || wallpaper === 'default') return 'Clean Neutral';
  const preset = WALLPAPER_GALLERY.find((w) => w.id === wallpaper);
  if (preset) return preset.label;
  if (wallpaper.includes('ai_wallpaper_')) return 'AI Generated';
  if (isImageUrlWallpaper(wallpaper)) return 'Custom Image';
  return 'Custom';
}

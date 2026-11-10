import { useState } from 'react';
import { Image, Platform, Text, type TextStyle } from 'react-native';
import { UNCATEGORIZED } from '@/lib/categories';
import type { Category } from '@/types/db';

// Colour emoji fonts first: some symbols (✈ ☀ ❤) otherwise come out as plain
// black glyphs in the app's text font, which disappear on dark backgrounds
const EMOJI_FONT: TextStyle =
  Platform.OS === 'web' ? { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Segoe UI Symbol",sans-serif' } : {};

/**
 * A category's picture (if one was uploaded) or its emoji, at `size` points.
 * A picture that can't be shown falls back to the emoji, and a missing or
 * empty emoji to the default tag, so a row never shows a blank or broken icon.
 */
export function CategoryIcon({ category, size = 20, emoji, dim }: {
  category?: Pick<Category, 'icon' | 'image'> | null;
  size?: number;
  /** Shown instead of the category (e.g. 🤝 for settlements). */
  emoji?: string;
  dim?: boolean;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const image = !emoji && category?.image && category.image !== broken ? category.image : null;
  if (image) {
    return (
      <Image
        source={{ uri: image }}
        onError={() => setBroken(image)}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        style={{ width: size * 1.25, height: size * 1.25, borderRadius: size * 0.35, opacity: dim ? 0.5 : 1 }}
      />
    );
  }
  const glyph = emoji ?? (category?.icon?.trim() || UNCATEGORIZED.icon);
  return (
    <Text
      accessible={false}
      style={[EMOJI_FONT, { fontSize: size, lineHeight: Math.round(size * 1.3), textAlign: 'center', opacity: dim ? 0.5 : 1 }]}
    >
      {glyph}
    </Text>
  );
}

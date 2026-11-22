import { useState } from 'react';
import { Image, Platform, Text, View, type TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { UNCATEGORIZED } from '@/lib/categories';
import { brandOf } from '@/lib/categoryBank';
import { readableOn } from '@/lib/contrast';
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
  const brand = !emoji && !image ? brandOf(category?.icon) : null;
  if (brand) return <BrandBadge brand={brand} size={size} dim={dim} />;
  // An unknown "b:" brand (from a newer version of the app): the default tag
  const icon = category?.icon?.startsWith('b:') ? '' : category?.icon?.trim();
  const glyph = emoji ?? (icon || UNCATEGORIZED.icon);
  return (
    <Text
      accessible={false}
      style={[EMOJI_FONT, { fontSize: size, lineHeight: Math.round(size * 1.3), textAlign: 'center', opacity: dim ? 0.5 : 1 }]}
    >
      {glyph}
    </Text>
  );
}

/**
 * A brand from the category bank: its logo (or monogram) in a rounded square
 * of the brand colour, the mark in white or dark, whichever reads better.
 * Drawn from data shipped with the app, so it shows offline.
 */
function BrandBadge({ brand, size, dim }: { brand: NonNullable<ReturnType<typeof brandOf>>; size: number; dim?: boolean }) {
  const box = Math.round(size * 1.25);
  const bg = `#${brand.hex}`;
  const fg = readableOn(bg);
  return (
    <View
      accessible={false}
      style={{ width: box, height: box, borderRadius: Math.round(box * 0.28), backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.5 : 1 }}
    >
      {brand.path ? (
        <Svg width={box * 0.62} height={box * 0.62} viewBox="0 0 24 24">
          <Path d={brand.path} fill={fg} />
        </Svg>
      ) : (
        <Text style={{ color: fg, fontWeight: '800', fontSize: brand.text && brand.text.length > 1 ? box * 0.36 : box * 0.5, lineHeight: box * 0.62 }} numberOfLines={1}>
          {brand.text}
        </Text>
      )}
    </View>
  );
}

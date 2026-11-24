import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Pressable, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useT } from '@/i18n';
import { formatCoords, mapLink, tilesAround, validCoords } from '@/lib/location';
import { radius, space, useColors } from '@/theme';
import { Row, Text } from './primitives';

const MAP_H = 180;
const ZOOM = 16;

/**
 * Where the expense was added: a row, closed at first, with the place name
 * (or the coordinates). Opening it shows a small OpenStreetMap preview with a
 * pin; offline, the coordinates and a link to open the map instead.
 */
export function LocationRow({ lat, lng, name }: { lat?: number | null; lng?: number | null; name?: string | null }) {
  const c = useColors();
  const { t } = useT();
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const has = validCoords(lat, lng);
  const label = has ? name || formatCoords(lat!, lng!) : t('location.none');

  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !has }}
        accessibilityLabel={`${t('location.label')}: ${label}`}
        disabled={!has}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, minHeight: 32, justifyContent: 'center' })}
      >
        <Row gap={space.sm} style={{ justifyContent: 'space-between' }}>
          <Text muted>{t('location.label')}</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1} muted={!has}>
            {has ? '📍 ' : ''}
            {label}
          </Text>
          {has ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} /> : null}
        </Row>
      </Pressable>
      {open && has ? <MapPreview lat={lat!} lng={lng!} still={still} /> : null}
    </View>
  );
}

function MapPreview({ lat, lng, still }: { lat: number; lng: number; still: boolean }) {
  const c = useColors();
  const { t } = useT();
  const grow = useRef(new Animated.Value(still ? MAP_H : 0)).current;
  const [failed, setFailed] = useState(0);
  const tiles = tilesAround(lat, lng, ZOOM);
  const offline = failed >= tiles.length;

  useEffect(() => {
    Animated.timing(grow, { toValue: MAP_H, duration: still ? 0 : 220, useNativeDriver: false }).start();
  }, []);

  return (
    <Animated.View style={{ height: grow, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.cardAlt }}>
      {offline ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md }}>
          <Ionicons name="location" size={28} color={c.danger} />
          <Text variant="mono">{formatCoords(lat, lng)}</Text>
          <Text variant="caption" muted center>
            {t('location.offline')}
          </Text>
        </View>
      ) : (
        <>
          {tiles.map((tile) => (
            <Image
              key={tile.key}
              source={{ uri: tile.url }}
              accessibilityIgnoresInvertColors
              onError={() => setFailed((n) => n + 1)}
              style={{ position: 'absolute', width: 256, height: 256, left: '50%', top: '50%', transform: [{ translateX: tile.dx }, { translateY: tile.dy }] }}
            />
          ))}
          {/* The pin's tip on the spot */}
          <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', transform: [{ translateX: -16 }, { translateY: -32 }] }}>
            <Ionicons name="location" size={32} color={c.danger} />
          </View>
          <Text variant="caption" style={{ position: 'absolute', bottom: 2, end: 6, fontSize: 10, backgroundColor: '#ffffffcc', color: '#333', paddingHorizontal: 4, borderRadius: 4 }}>
            © OpenStreetMap
          </Text>
        </>
      )}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('location.openMap')}
        onPress={() => Linking.openURL(mapLink(lat, lng))}
        style={{ position: 'absolute', top: 6, end: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 10, minHeight: 32 }}
      >
        <Ionicons name="open-outline" size={14} color={c.primary} />
        <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
          {t('location.openMap')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * The expense form's Place field: the place found (name, coordinates) sits
 * inside the field with a pin; at its end, a map button opens the small map
 * inside the same box and × leaves the place out of this expense.
 */
export function PlaceField({ place, locating, onClear }: { place: { lat: number; lng: number; name: string | null } | null; locating?: boolean; onClear?: () => void }) {
  const c = useColors();
  const { t } = useT();
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const has = !!place && validCoords(place.lat, place.lng);
  if (!has && !locating) return null;
  const name = has ? place!.name || formatCoords(place!.lat, place!.lng) : t('location.locating');
  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardAlt, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingStart: space.md, paddingEnd: space.xs, minHeight: 52 }}>
        <Ionicons name={has ? 'location' : 'locate-outline'} size={18} color={has ? c.danger : c.textMuted} />
        <View style={{ flex: 1, minWidth: 0 }} accessibilityLabel={`${t('location.label')}: ${name}`}>
          <Text variant="caption" muted style={{ fontSize: 11 }}>
            {t('location.label')}
          </Text>
          <Text style={{ fontWeight: '600' }} numberOfLines={1} color={has ? c.text : c.textMuted}>
            {name}
          </Text>
          {has && place!.name ? (
            <Text variant="caption" faint numberOfLines={1} style={{ fontSize: 11 }}>
              {formatCoords(place!.lat, place!.lng)}
            </Text>
          ) : null}
        </View>
        {has ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={t(open ? 'location.hideMap' : 'location.showMap')}
            onPress={() => setOpen((o) => !o)}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: open || pressed ? c.card : 'transparent' })}
          >
            <Ionicons name={open ? 'map' : 'map-outline'} size={19} color={c.primary} />
          </Pressable>
        ) : null}
        {has && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('location.clear')}
            onPress={() => {
              setOpen(false);
              onClear();
            }}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Ionicons name="close-circle" size={20} color={c.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {open && has ? (
        <View style={{ paddingHorizontal: space.sm, paddingBottom: space.sm }}>
          <MapPreview lat={place!.lat} lng={place!.lng} still={still} />
        </View>
      ) : null}
    </View>
  );
}

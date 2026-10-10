import { useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { colors } from './ui';

export type DonutSlice = { key: string; value: number; color: string; label: string };

const LABEL_MIN_SHARE = 0.03;
// SVG text doesn't inherit the app font in browsers; phones use the system font already.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;
const LINE_HEIGHT = 30;

function point(cx: number, cy: number, r: number, angle: number) {
  // Angle 0 is 12 o'clock, going clockwise.
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p0 = point(cx, cy, rOuter, a0);
  const p1 = point(cx, cy, rOuter, a1);
  const p2 = point(cx, cy, rInner, a1);
  const p3 = point(cx, cy, rInner, a0);
  return `M${p0.x} ${p0.y} A${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y} L${p2.x} ${p2.y} A${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y} Z`;
}

/**
 * A donut of shares with outside labels (name and %) joined by leader lines,
 * like a phone money app. Labels are spread so they don't overlap; slices
 * under 3% stay unlabelled (the list under the chart has every figure).
 */
export function Donut({ slices, centerTop, centerBottom, onSlicePress }: { slices: DonutSlice[]; centerTop: string; centerBottom: string; onSlicePress?: (key: string) => void }) {
  const [width, setWidth] = useState(0);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const height = 280;
  const cx = width / 2;
  const cy = height / 2;
  const rOuter = Math.min(84, width / 4.8);
  const rInner = rOuter * 0.58;

  // Each slice starts where the ones before it end.
  const arcs = slices.map((s, i) => {
    const before = slices.slice(0, i).reduce((sum, x) => sum + x.value, 0);
    const share = total > 0 ? s.value / total : 0;
    const a0 = total > 0 ? (before / total) * Math.PI * 2 : 0;
    const a1 = a0 + share * Math.PI * 2;
    return { ...s, a0, a1, share, mid: (a0 + a1) / 2 };
  });

  // Labels on each side, spread vertically so they never overlap.
  type Label = { key: string; side: 1 | -1; anchorY: number; y: number; elbow: { x: number; y: number }; edge: { x: number; y: number }; text: string; pct: string };
  const labels: Label[] = arcs
    .filter((a) => a.share >= LABEL_MIN_SHARE)
    .map((a) => {
      const side: 1 | -1 = Math.sin(a.mid) >= 0 ? 1 : -1;
      const edge = point(cx, cy, rOuter, a.mid);
      const elbow = point(cx, cy, rOuter + 14, a.mid);
      return { key: a.key, side, anchorY: elbow.y, y: elbow.y, edge, elbow, text: a.label, pct: `${(a.share * 100).toFixed(1)} %` };
    });
  for (const side of [1, -1] as const) {
    const list = labels.filter((l) => l.side === side).sort((a, b) => a.anchorY - b.anchorY);
    for (let i = 1; i < list.length; i++) if (list[i].y - list[i - 1].y < LINE_HEIGHT) list[i].y = list[i - 1].y + LINE_HEIGHT;
    // If the stack ran off the bottom, push it back up.
    const overflow = list.length ? list[list.length - 1].y - (height - 14) : 0;
    if (overflow > 0) for (const l of list) l.y -= overflow;
    for (let i = list.length - 2; i >= 0; i--) if (list[i + 1].y - list[i].y < LINE_HEIGHT) list[i].y = list[i + 1].y - LINE_HEIGHT;
  }
  const labelX = (side: 1 | -1) => cx + side * (rOuter + 26);
  const maxChars = Math.max(6, Math.floor((width / 2 - rOuter - 30) / 6.6));
  const clip = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessibilityRole="image" accessibilityLabel={slices.map((s) => `${s.label} ${total ? Math.round((s.value / total) * 100) : 0}%`).join(', ')}>
      {width > 0 && total > 0 ? (
        <Svg width={width} height={height}>
          {arcs.length === 1 ? (
            <Circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke={arcs[0].color} strokeWidth={rOuter - rInner} fill="none" onPress={() => onSlicePress?.(arcs[0].key)} />
          ) : (
            arcs.map((a) => (
              // A 2px gap in the surface colour between slices.
              <Path key={a.key} d={arcPath(cx, cy, rOuter, rInner, a.a0, a.a1)} fill={a.color} stroke={colors.card} strokeWidth={2} onPress={() => onSlicePress?.(a.key)} />
            ))
          )}
          {labels.map((l) => {
            const x = labelX(l.side);
            return (
              <G key={l.key}>
                <Polyline points={`${l.edge.x},${l.edge.y} ${l.elbow.x},${l.elbow.y} ${x - l.side * 4},${l.y}`} fill="none" stroke={colors.muted} strokeWidth={1} />
                <SvgText fontFamily={FONT} x={x} y={l.y - 2} fontSize={12} fontWeight="600" fill={colors.text} textAnchor={l.side === 1 ? 'start' : 'end'}>
                  {clip(l.text)}
                </SvgText>
                <SvgText fontFamily={FONT} x={x} y={l.y + 12} fontSize={11} fill={colors.muted} textAnchor={l.side === 1 ? 'start' : 'end'}>
                  {l.pct}
                </SvgText>
              </G>
            );
          })}
          <SvgText fontFamily={FONT} x={cx} y={cy - 2} fontSize={15} fontWeight="700" fill={colors.text} textAnchor="middle">
            {centerTop}
          </SvgText>
          <SvgText fontFamily={FONT} x={cx} y={cy + 15} fontSize={11} fill={colors.muted} textAnchor="middle">
            {centerBottom}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

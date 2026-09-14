import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { sizes } from '../tokens';

/**
 * The icons that carry meaning beside a colour (INV-24): a state is always a shape as well. Drawn as strokes on a
 * 24-unit grid, in whatever colour the caller's theme gives them.
 */
export type IconName = 'check' | 'lock' | 'projected' | 'inProgress' | 'skipped' | 'close' | 'backspace' | 'placeholder';

interface IconProps {
  readonly name: IconName;
  readonly color: string;
  readonly size?: number;
}

export function Icon({ name, color, size = sizes.icon }: IconProps) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" testID={`icon-${name}`} accessible={false}>
      {name === 'check' && <Path d="M5 12.5 L10 17.5 L19 7" {...stroke} />}
      {name === 'lock' && (
        <>
          <Rect x={5} y={11} width={14} height={9} rx={2} {...stroke} />
          <Path d="M8 11 V8 A4 4 0 0 1 16 8 V11" {...stroke} />
        </>
      )}
      {name === 'projected' && <Circle cx={12} cy={12} r={8} strokeDasharray="3 3" {...stroke} />}
      {name === 'inProgress' && (
        <>
          <Circle cx={12} cy={12} r={8} {...stroke} />
          <Path d="M12 4 A8 8 0 0 1 12 20 Z" fill={color} />
        </>
      )}
      {name === 'skipped' && (
        <>
          <Circle cx={12} cy={12} r={8} {...stroke} />
          <Line x1={6.5} y1={17.5} x2={17.5} y2={6.5} {...stroke} />
        </>
      )}
      {name === 'close' && (
        <>
          <Line x1={6} y1={6} x2={18} y2={18} {...stroke} />
          <Line x1={18} y1={6} x2={6} y2={18} {...stroke} />
        </>
      )}
      {name === 'backspace' && (
        <>
          <Path d="M9 6 H20 V18 H9 L3 12 Z" {...stroke} />
          <Line x1={12} y1={9.5} x2={17} y2={14.5} {...stroke} />
          <Line x1={17} y1={9.5} x2={12} y2={14.5} {...stroke} />
        </>
      )}
      {name === 'placeholder' && (
        <>
          <Rect x={3} y={3} width={18} height={18} {...stroke} />
          <Line x1={3} y1={3} x2={21} y2={21} {...stroke} />
          <Line x1={21} y1={3} x2={3} y2={21} {...stroke} />
        </>
      )}
    </Svg>
  );
}

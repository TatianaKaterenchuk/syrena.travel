import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

export interface GoldStarProps {
  size?: number;
  color?: string;
}

/**
 * 4-point star SVG used as the Syrena brand logo on the splash screen.
 * The path draws a vertically-oriented 4-point star shape.
 */
const GoldStar: React.FC<GoldStarProps> = ({
  size = 48,
  color = colors.gold.primary,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Path
        d="M50 0 L62 38 L100 50 L62 62 L50 100 L38 62 L0 50 L38 38 Z"
        fill={color}
      />
    </Svg>
  );
};

export default React.memo(GoldStar);

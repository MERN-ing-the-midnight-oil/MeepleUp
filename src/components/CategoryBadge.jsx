import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

/**
 * Category Badge Component
 * Displays an icon for a game category with gold/silver/bronze coloring
 */

const BadgeIcon = ({ icon, level, size = 24 }) => {
  const colors = {
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  };

  const color = colors[level] || '#666';
  const iconSize = size;

  // Icon paths for each category - simplified SVG paths
  const icons = {
    brain: (
      <Path
        d="M12 2C8.13 2 5 5.13 5 9c0 1.74.65 3.33 1.72 4.54C5.5 14.5 4 16.5 4 19h16c0-2.5-1.5-4.5-2.72-5.46C18.35 12.33 19 10.74 19 9c0-3.87-3.13-7-7-7z"
        fill={color}
      />
    ),
    house: (
      <Path
        d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z"
        fill={color}
      />
    ),
    balloons: (
      <>
        <Circle cx="8" cy="10" r="2.5" fill={color} />
        <Circle cx="16" cy="8" r="2" fill={color} />
        <Line x1="8" y1="12.5" x2="8" y2="18" stroke={color} strokeWidth="1.5" />
        <Line x1="16" y1="10" x2="16" y2="16" stroke={color} strokeWidth="1.5" />
      </>
    ),
    swords: (
      <>
        <Path d="M6 2 L6 8 L4 10 L8 10 L6 8 Z" fill={color} />
        <Path d="M18 2 L18 8 L20 10 L16 10 L18 8 Z" fill={color} />
        <Rect x="11" y="8" width="2" height="12" fill={color} />
      </>
    ),
    compass: (
      <>
        <Circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="2" />
        <Line x1="12" y1="4" x2="12" y2="8" stroke={color} strokeWidth="2" />
        <Line x1="12" y1="16" x2="12" y2="20" stroke={color} strokeWidth="2" />
        <Line x1="4" y1="12" x2="8" y2="12" stroke={color} strokeWidth="2" />
        <Line x1="16" y1="12" x2="20" y2="12" stroke={color} strokeWidth="2" />
        <Path d="M12 8 L16 12 L12 16 L8 12 Z" fill={color} />
      </>
    ),
    pattern: (
      <>
        <Rect x="4" y="4" width="6" height="6" fill={color} />
        <Rect x="14" y="4" width="6" height="6" fill={color} />
        <Rect x="4" y="14" width="6" height="6" fill={color} />
        <Rect x="14" y="14" width="6" height="6" fill={color} />
      </>
    ),
    toy: (
      <>
        <Rect x="6" y="6" width="12" height="12" fill={color} rx="2" />
        <Rect x="8" y="8" width="8" height="8" fill="white" />
        <Circle cx="10" cy="10" r="1" fill={color} />
        <Circle cx="14" cy="10" r="1" fill={color} />
        <Circle cx="10" cy="14" r="1" fill={color} />
        <Circle cx="14" cy="14" r="1" fill={color} />
      </>
    ),
    cards: (
      <>
        <Rect x="4" y="6" width="16" height="12" fill={color} rx="1" />
        <Rect x="6" y="8" width="12" height="8" fill="white" rx="0.5" />
        <Line x1="8" y1="10" x2="16" y2="10" stroke={color} strokeWidth="0.5" />
        <Line x1="8" y1="12" x2="14" y2="12" stroke={color} strokeWidth="0.5" />
        <Line x1="8" y1="14" x2="16" y2="14" stroke={color} strokeWidth="0.5" />
      </>
    ),
  };

  const IconComponent = icons[icon] || icons.brain;

  return (
    <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
      {IconComponent}
    </Svg>
  );
};

const CategoryBadge = ({ badge, size = 20 }) => {
  const { level, icon, name } = badge;

  return (
    <View style={[styles.badge, styles[`badge${level.charAt(0).toUpperCase() + level.slice(1)}`]]}>
      <BadgeIcon icon={icon} level={level} size={size} />
      <Text style={[styles.badgeText, styles[`badgeText${level.charAt(0).toUpperCase() + level.slice(1)}`]]}>
        {name}
      </Text>
    </View>
  );
};

export default CategoryBadge;

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
    marginRight: 4,
    marginBottom: 4,
    borderWidth: 1.5,
  },
  badgeGold: {
    backgroundColor: '#FFF9E6',
    borderColor: '#FFD700',
  },
  badgeSilver: {
    backgroundColor: '#F5F5F5',
    borderColor: '#C0C0C0',
  },
  badgeBronze: {
    backgroundColor: '#FFF4E6',
    borderColor: '#CD7F32',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  badgeTextGold: {
    color: '#B8860B',
  },
  badgeTextSilver: {
    color: '#808080',
  },
  badgeTextBronze: {
    color: '#8B4513',
  },
});


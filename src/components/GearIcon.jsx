import React from 'react';
import Octicons from '@expo/vector-icons/Octicons';

/**
 * Gear icon using Octicons
 */
const GearIcon = ({ size = 16, color = '#666' }) => {
  return <Octicons name="gear" size={size} color={color} />;
};

export default GearIcon;


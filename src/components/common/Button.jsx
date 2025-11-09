import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

const Button = ({ label, onPress, style, disabled, title, variant = 'primary' }) => {
    return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        styles[variant],
        style,
        disabled && styles.disabled,
      ]}
      accessibilityLabel={title || label}
    >
      <Text style={[styles.label, variant === 'outline' && styles.outlineLabel]}>
            {label}
      </Text>
    </Pressable>
    );
};

const styles = StyleSheet.create({
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primary: {
    backgroundColor: '#4a90e2',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#4a90e2',
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  outlineLabel: {
    color: '#4a90e2',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Button;
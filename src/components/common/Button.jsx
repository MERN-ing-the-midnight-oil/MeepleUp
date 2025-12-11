import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { theme, commonStyles } from '../../utils/theme';

const Button = ({ label, onPress, style, disabled, title, variant = 'primary', textStyle }) => {
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
      <Text
        style={[
          styles.label,
          variant === 'outline' && styles.outlineLabel,
          variant === 'danger' && styles.dangerLabel,
          textStyle,
        ]}
      >
            {label}
      </Text>
    </Pressable>
    );
};

const styles = StyleSheet.create({
  button: {
    ...commonStyles.button,
  },
  primary: {
    ...commonStyles.buttonPrimary,
  },
  outline: {
    ...commonStyles.buttonOutline,
  },
  danger: {
    backgroundColor: theme.colors.error,
  },
  label: {
    ...commonStyles.buttonText,
  },
  outlineLabel: {
    ...commonStyles.buttonTextOutline,
  },
  dangerLabel: {
    color: '#fff',
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Button;
import React, { useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { theme, commonStyles } from '../../utils/theme';

const Input = React.forwardRef(({
  placeholder,
  value,
  onChangeText,
  style,
  maxLength,
  disabled,
  onKeyPress,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  multiline = false,
  numberOfLines = multiline ? 4 : 1,
  textAlignVertical = multiline ? 'top' : 'center',
  onFocus,
  onBlur,
  placeholderTextColor,
  ...rest
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <TextInput
      ref={ref}
      style={[
        styles.input,
        isFocused && styles.inputFocused,
        multiline && styles.multiline,
        style,
        disabled && styles.disabled,
      ]}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor || theme.colors.textSecondary}
      value={value}
      onChangeText={onChangeText}
      onKeyPress={onKeyPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      maxLength={maxLength}
      editable={!disabled}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={textAlignVertical}
      {...rest}
    />
  );
});

Input.displayName = 'Input';

const styles = StyleSheet.create({
  input: {
    ...commonStyles.input,
    minHeight: 44,
  },
  inputFocused: {
    ...commonStyles.inputFocused,
  },
  multiline: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  disabled: {
    backgroundColor: theme.colors.woodLight,
    opacity: 0.6,
  },
});

export default Input;
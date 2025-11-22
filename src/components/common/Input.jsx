import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

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
  ...rest
}, ref) => {
  return (
    <TextInput
      ref={ref}
      style={[
        styles.input,
        multiline && styles.multiline,
        style,
        disabled && styles.disabled,
      ]}
      placeholder={placeholder}
      placeholderTextColor="#999"
      value={value}
      onChangeText={onChangeText}
      onKeyPress={onKeyPress}
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
    borderWidth: 2,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    minHeight: 44,
  },
  multiline: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  disabled: {
    backgroundColor: '#f5f5f5',
    opacity: 0.6,
  },
});

export default Input;
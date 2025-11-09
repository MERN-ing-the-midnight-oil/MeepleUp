import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

const Input = ({
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
}) => {
    return (
    <TextInput
      style={[styles.input, style, disabled && styles.disabled]}
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
        />
    );
};

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
  disabled: {
    backgroundColor: '#f5f5f5',
    opacity: 0.6,
  },
});

export default Input;
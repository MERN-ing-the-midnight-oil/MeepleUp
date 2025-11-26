import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';

/**
 * A wrapper component that combines KeyboardAvoidingView and ScrollView
 * to handle keyboard interactions properly across iOS and Android.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {number} props.keyboardVerticalOffset - Offset for keyboard (defaults to 0, can be overridden)
 * @param {string} props.behavior - KeyboardAvoidingView behavior (defaults to 'padding' on iOS, 'height' on Android)
 * @param {Object} props.style - Additional styles
 * @param {Object} props.contentContainerStyle - ScrollView content container styles
 * @param {boolean} props.keyboardShouldPersistTaps - Whether taps should persist when keyboard is visible
 */
const KeyboardAwareScrollView = ({
  children,
  keyboardVerticalOffset,
  behavior,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  ...scrollViewProps
}) => {
  // Use provided offset or default to 0
  // The offset is mainly needed when there's a fixed header/navigation
  // Setting to 0 lets the ScrollView handle scrolling naturally
  const offset = keyboardVerticalOffset !== undefined ? keyboardVerticalOffset : 0;

  // Use 'padding' behavior on iOS (works better with ScrollView)
  // On Android, ScrollView usually handles keyboard automatically, but padding can help
  const defaultBehavior = behavior ?? (Platform.OS === 'ios' ? 'padding' : 'padding');

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoidingView, style]}
      behavior={defaultBehavior}
      keyboardVerticalOffset={offset}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={true}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

export default KeyboardAwareScrollView;


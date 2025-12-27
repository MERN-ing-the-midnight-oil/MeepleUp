import React, { useRef, useEffect } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  Keyboard,
} from 'react-native';

/**
 * A wrapper component that combines KeyboardAvoidingView and ScrollView
 * to handle keyboard interactions properly across iOS and Android.
 * Automatically scrolls to end when keyboard appears to keep submit buttons visible.
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {number} props.keyboardVerticalOffset - Offset for keyboard (defaults to 0, can be overridden)
 * @param {string} props.behavior - KeyboardAvoidingView behavior (defaults to 'padding' on iOS, 'height' on Android)
 * @param {Object} props.style - Additional styles
 * @param {Object} props.contentContainerStyle - ScrollView content container styles
 * @param {boolean} props.keyboardShouldPersistTaps - Whether taps should persist when keyboard is visible
 * @param {number} props.extraScrollHeight - Extra padding at bottom when keyboard is visible (defaults to 150)
 */
const KeyboardAwareScrollView = React.forwardRef(({
  children,
  keyboardVerticalOffset,
  behavior,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  extraScrollHeight = 150,
  ...scrollViewProps
}, ref) => {
  const scrollViewRef = useRef(null);
  const keyboardDidShowListener = useRef(null);

  // Use the forwarded ref or internal ref
  const actualRef = ref || scrollViewRef;

  // Use provided offset or default to 0
  // The offset is mainly needed when there's a fixed header/navigation
  const offset = keyboardVerticalOffset !== undefined ? keyboardVerticalOffset : 0;

  // Use 'padding' behavior on iOS (works better with ScrollView)
  // On Android, ScrollView usually handles keyboard automatically, but padding can help
  const defaultBehavior = behavior ?? (Platform.OS === 'ios' ? 'padding' : 'padding');

  useEffect(() => {
    // Listen for keyboard show events and scroll to end to show submit buttons
    keyboardDidShowListener.current = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        // Small delay to ensure keyboard animation has started
        setTimeout(() => {
          if (actualRef?.current) {
            actualRef.current.scrollToEnd({ animated: true });
          }
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener.current?.remove();
    };
  }, [actualRef]);

  // Merge contentContainerStyle to ensure proper padding
  const mergedContentContainerStyle = [
    styles.contentContainer,
    { paddingBottom: extraScrollHeight },
    contentContainerStyle,
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.keyboardAvoidingView, style]}
      behavior={defaultBehavior}
      keyboardVerticalOffset={offset}
    >
      <ScrollView
        ref={actualRef}
        style={styles.scrollView}
        contentContainerStyle={mergedContentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={true}
        scrollEventThrottle={16}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

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

KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

export default KeyboardAwareScrollView;


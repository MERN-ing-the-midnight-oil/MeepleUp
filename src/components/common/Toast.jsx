import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { theme } from '../../utils/theme';
import { useResponsive } from '../../utils/responsive';
import { TIMEOUTS } from '../../utils/constants';

/**
 * Toast Notification Component
 * 
 * Provides non-blocking notifications that auto-dismiss after a duration.
 * Supports success, error, warning, and info types.
 * 
 * Usage:
 *   import { useToast } from './Toast';
 *   const toast = useToast();
 *   toast.success('Game added!');
 *   toast.error('Failed to save');
 */

const ToastContext = React.createContext();

// Toast types
export const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Default duration from constants
const DEFAULT_DURATION = TIMEOUTS.TOAST_DURATION_MS;
const ERROR_DURATION = TIMEOUTS.TOAST_ERROR_DURATION_MS;

/**
 * Toast Provider - Wrap your app with this
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = TOAST_TYPES.INFO, duration = DEFAULT_DURATION) => {
    const id = Date.now() + Math.random();
    const toast = { id, message, type, duration };
    
    setToasts(prev => [...prev, toast]);
    
    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    
    return id;
  }, []);

  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const hideAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = useCallback((message, duration = DEFAULT_DURATION) => {
    return showToast(message, TOAST_TYPES.SUCCESS, duration);
  }, [showToast]);

  const error = useCallback((message, duration = ERROR_DURATION) => {
    return showToast(message, TOAST_TYPES.ERROR, duration);
  }, [showToast]);

  const warning = useCallback((message, duration = DEFAULT_DURATION) => {
    return showToast(message, TOAST_TYPES.WARNING, duration);
  }, [showToast]);

  const info = useCallback((message, duration = DEFAULT_DURATION) => {
    return showToast(message, TOAST_TYPES.INFO, duration);
  }, [showToast]);

  const value = {
    showToast,
    hideToast,
    hideAllToasts,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={hideToast} />
    </ToastContext.Provider>
  );
};

/**
 * Hook to use toast notifications
 */
export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

/**
 * Toast Container - Renders all active toasts
 */
const ToastContainer = ({ toasts, onDismiss }) => {
  const { isMobile } = useResponsive();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          index={index}
          onDismiss={onDismiss}
          isMobile={isMobile}
        />
      ))}
    </View>
  );
};

/**
 * Individual Toast Item
 */
const ToastItem = ({ toast, index, onDismiss, isMobile }) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(-100));
  const { message, type, id } = toast;

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss(id);
    });
  };

  const getToastStyles = () => {
    switch (type) {
      case TOAST_TYPES.SUCCESS:
        return {
          backgroundColor: theme.colors.feltGreen,
          icon: 'check-circle',
          iconColor: '#fff',
        };
      case TOAST_TYPES.ERROR:
        return {
          backgroundColor: theme.colors.meepleRed,
          icon: 'error',
          iconColor: '#fff',
        };
      case TOAST_TYPES.WARNING:
        return {
          backgroundColor: '#FF9800',
          icon: 'warning',
          iconColor: '#fff',
        };
      case TOAST_TYPES.INFO:
      default:
        return {
          backgroundColor: theme.colors.woodMedium,
          icon: 'info',
          iconColor: '#fff',
        };
    }
  };

  const toastStyles = getToastStyles();
  const topOffset = index * (isMobile ? 70 : 80) + (isMobile ? 60 : 80);

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
          top: topOffset,
          maxWidth: isMobile ? '90%' : 400,
        },
        { backgroundColor: toastStyles.backgroundColor },
      ]}
    >
      <Pressable
        style={styles.toastContent}
        onPress={handleDismiss}
        android_ripple={{ color: 'rgba(255, 255, 255, 0.2)' }}
      >
        <MaterialIcons
          name={toastStyles.icon}
          size={isMobile ? 20 : 24}
          color={toastStyles.iconColor}
          style={styles.icon}
        />
        <Text style={[styles.message, { color: toastStyles.iconColor }]} numberOfLines={3}>
          {message}
        </Text>
        <Pressable onPress={handleDismiss} style={styles.closeButton}>
          <MaterialIcons name="close" size={isMobile ? 18 : 20} color={toastStyles.iconColor} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
    zIndex: 9999,
    ...Platform.select({
      web: {
        position: 'fixed',
      },
    }),
  },
  toast: {
    position: 'absolute',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    minWidth: 200,
    maxWidth: 400,
    ...theme.shadows.card,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  message: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    lineHeight: theme.typography.lineHeight.base,
  },
  closeButton: {
    marginLeft: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
});

export default ToastProvider;


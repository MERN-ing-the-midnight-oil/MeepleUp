import React from 'react';
import {
  Modal as RNModal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useResponsive } from '../../utils/responsive';
import { theme, commonStyles } from '../../utils/theme';

const Modal = ({ isOpen, onClose, children, title, fullScreen = false }) => {
  const { width, height } = useWindowDimensions();
  const { isMobile, isTablet } = useResponsive();
  
  // For fullScreen modals, use "none" animation to prevent flickering on re-renders
  // Regular modals still use "slide" for better UX
  const animationType = fullScreen ? 'none' : 'slide';
  
  // Responsive modal width
  const modalWidth = isMobile ? '95%' : isTablet ? '85%' : '90%';
  const maxModalWidth = isMobile ? width * 0.95 : isTablet ? 600 : 700;
  
  // Calculate max height for ScrollView (accounting for header and padding)
  // Use a percentage that works well with the content container's maxHeight: 80%
  const maxScrollHeight = Platform.OS === 'web' ? '60vh' : height * 0.6;
  
    return (
    <RNModal
      visible={isOpen}
      transparent={true}
      animationType={animationType}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.overlayPressable} onPress={fullScreen ? undefined : onClose} />
          <View style={[
            styles.content, 
            fullScreen && styles.contentFullScreen,
            !fullScreen && { width: modalWidth, maxWidth: maxModalWidth }
          ]}>
            {fullScreen ? (
              <>
                <View style={styles.fullScreenHeader}>
                  <TouchableOpacity onPress={onClose} style={styles.backButton}>
                    <Text style={styles.backButtonText}>← Back</Text>
                  </TouchableOpacity>
                  {title && <Text style={styles.fullScreenTitle}>{title}</Text>}
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeText}>×</Text>
                  </TouchableOpacity>
                </View>
                {children}
              </>
            ) : (
              <>
                <View style={styles.header}>
                  {title && <Text style={styles.title}>{title}</Text>}
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <Text style={styles.closeText}>×</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  style={[styles.scrollView, { maxHeight: maxScrollHeight }]}
                  nestedScrollEnabled={true}
                >
                  {children}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
    );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  scrollView: {
    // maxHeight will be set dynamically
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.sm,
  },
  content: {
    backgroundColor: theme.colors.surfaceColor,
    borderRadius: 0, // Containers should have no rounded corners
    padding: theme.spacing.xl,
    maxHeight: '80%',
    minHeight: 200,
    zIndex: 1,
    position: 'relative',
    flexDirection: 'column',
    // Responsive padding
    ...(Platform.OS === 'web' ? {} : {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.lg,
    }),
  },
  contentFullScreen: {
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    padding: 0,
    minHeight: 0, // Important for ScrollView to work properly
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingTop: Platform.OS === 'ios' ? 50 : theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.woodMedium,
    backgroundColor: theme.colors.surfaceColor,
    zIndex: 10,
    position: 'relative',
    width: '100%',
  },
  backButton: {
    padding: theme.spacing.sm,
    minWidth: 60,
    minHeight: 44, // Better touch target
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.meepleRed,
    fontWeight: theme.typography.fontWeight.medium,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(14px, 1.5vw, 16px)',
    } : {}),
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.meepleRed,
    backgroundColor: theme.colors.woodLight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    flex: 1,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(16px, 2vw, 20px)',
    } : {}),
  },
  fullScreenTitle: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: theme.spacing.sm,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(16px, 2vw, 18px)',
    } : {}),
  },
  closeButton: {
    padding: theme.spacing.sm,
    minWidth: 44, // Better touch target
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 28,
    color: theme.colors.textSecondary,
    lineHeight: 28,
    fontWeight: '300',
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(24px, 3vw, 28px)',
    } : {}),
  },
});

export default Modal;
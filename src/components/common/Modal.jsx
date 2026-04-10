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
import logger from '../../utils/logger';

const ModalComponent = ({ isOpen, onClose, children, title, fullScreen = false }) => {
  const { width, height } = useWindowDimensions();
  const { isMobile, isTablet } = useResponsive();
  
  // Use "none" animation to prevent re-animation on re-renders
  // This prevents the minimize/maximize effect when modal content updates
  // The slide animation was causing the modal to re-animate on every re-render
  const animationType = 'none';
  
  // Responsive modal width - memoize to prevent recalculation
  const modalWidth = React.useMemo(() => isMobile ? '95%' : isTablet ? '85%' : '90%', [isMobile, isTablet]);
  const maxModalWidth = React.useMemo(() => isMobile ? width * 0.95 : isTablet ? 600 : 700, [isMobile, isTablet, width]);
  
  // Calculate max height for ScrollView (accounting for header and padding)
  // Use a percentage that works well with the content container's maxHeight: 80%
  const maxScrollHeight = React.useMemo(() => Platform.OS === 'web' ? '60vh' : height * 0.6, [height]);
  
  // Memoize onRequestClose to prevent recreation on every render
  const handleRequestClose = React.useCallback(() => {
    logger.debug('[Modal] onRequestClose called (Android back button or similar)');
    onClose();
  }, [onClose]);
  
  // Only log when modal actually opens/closes, not on every render
  const prevIsOpenRef = React.useRef(isOpen);
  React.useEffect(() => {
    if (prevIsOpenRef.current !== isOpen) {
      logger.debug('[Modal] Modal state changed, isOpen:', isOpen, 'title:', title);
      prevIsOpenRef.current = isOpen;
    }
  }, [isOpen, title]);
  
  // Ref to maintain scroll position
  const scrollViewRef = React.useRef(null);
  
  return (
    <RNModal
      visible={isOpen}
      transparent={true}
      animationType={animationType}
      onRequestClose={handleRequestClose}
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
                {title && (
                  <View style={styles.header}>
                    <Text style={styles.title}>{title}</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                      <Text style={styles.closeText}>×</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {!title && (
                  <View style={styles.headerCloseOnly}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                      <Text style={styles.closeText}>×</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <ScrollView
                  ref={scrollViewRef}
                  key="modal-scrollview" // Stable key to prevent unmounting
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  style={[styles.scrollView, { maxHeight: maxScrollHeight }]}
                  nestedScrollEnabled={true}
                  removeClippedSubviews={false}
                  maintainVisibleContentPosition={null}
                  keyboardDismissMode="none" // Prevent keyboard from dismissing on scroll
                  scrollEventThrottle={16}
                  bounces={false} // Prevent bouncing that might cause layout shifts
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
    flexShrink: 0,
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
  headerCloseOnly: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
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

// Memoize Modal to prevent re-renders that cause minimizing/maximizing
// When modal is open, we allow children to update (for input values) but prevent
// the Modal structure from re-rendering, which causes the collapse/expand behavior
const Modal = React.memo(ModalComponent, (prevProps, nextProps) => {
  // Critical props that should trigger re-render
  const isOpenChanged = prevProps.isOpen !== nextProps.isOpen;
  const titleChanged = prevProps.title !== nextProps.title;
  const fullScreenChanged = prevProps.fullScreen !== nextProps.fullScreen;
  const onCloseChanged = prevProps.onClose !== nextProps.onClose;
  
  // If modal is open and staying open, prevent re-render even if children change
  // React will still update the children through reconciliation, but the Modal
  // structure (ScrollView, KeyboardAvoidingView, etc.) won't re-render
  const isOpenAndStayingOpen = prevProps.isOpen && nextProps.isOpen && !isOpenChanged;
  
  // Only update if critical props changed
  // When modal is open, children changes are handled by React's reconciliation
  // without re-rendering the Modal component structure
  const shouldUpdate = isOpenChanged || titleChanged || fullScreenChanged || (onCloseChanged && !isOpenAndStayingOpen);
  
  return !shouldUpdate; // true = props equal (skip render), false = different (update)
});

Modal.displayName = 'Modal';

export default Modal;
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

const Modal = ({ isOpen, onClose, children, title, fullScreen = false }) => {
  const { width, height } = useWindowDimensions();
  const { isMobile, isTablet } = useResponsive();
  
  // For fullScreen modals, use "none" animation to prevent flickering on re-renders
  // Regular modals still use "slide" for better UX
  const animationType = fullScreen ? 'none' : 'slide';
  
  // Responsive modal width
  const modalWidth = isMobile ? '95%' : isTablet ? '85%' : '90%';
  const maxModalWidth = isMobile ? width * 0.95 : isTablet ? 600 : 700;
  
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
                  style={styles.scrollView}
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
    maxHeight: '60%',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%',
    zIndex: 1,
    position: 'relative',
    // Responsive padding
    ...(Platform.OS === 'web' ? {} : {
      paddingHorizontal: 16,
      paddingVertical: 16,
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
    marginBottom: 16,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
    zIndex: 10,
    position: 'relative',
    width: '100%',
  },
  backButton: {
    padding: 8,
    minWidth: 60,
    minHeight: 44, // Better touch target
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#4a90e2',
    fontWeight: '500',
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(14px, 1.5vw, 16px)',
    } : {}),
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    flex: 1,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(16px, 2vw, 20px)',
    } : {}),
  },
  fullScreenTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginHorizontal: 8,
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(16px, 2vw, 18px)',
    } : {}),
  },
  closeButton: {
    padding: 8,
    minWidth: 44, // Better touch target
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 28,
    color: '#666',
    lineHeight: 28,
    fontWeight: '300',
    // Responsive font size
    ...(Platform.OS === 'web' ? {
      fontSize: 'clamp(24px, 3vw, 28px)',
    } : {}),
  },
});

export default Modal;
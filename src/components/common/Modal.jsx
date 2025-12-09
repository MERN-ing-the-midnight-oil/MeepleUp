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
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const Modal = ({ isOpen, onClose, children, title, fullScreen = false }) => {
  // For fullScreen modals, use "none" animation to prevent flickering on re-renders
  // Regular modals still use "slide" for better UX
  const animationType = fullScreen ? 'none' : 'slide';
  
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
          <View style={[styles.content, fullScreen && styles.contentFullScreen]}>
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
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: SCREEN_HEIGHT * 0.8,
    zIndex: 1,
    position: 'relative',
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
    alignItems: 'flex-start',
  },
  backButtonText: {
    fontSize: 16,
    color: '#4a90e2',
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  fullScreenTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  closeButton: {
    padding: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 28,
    color: '#666',
    lineHeight: 28,
    fontWeight: '300',
  },
});

export default Modal;
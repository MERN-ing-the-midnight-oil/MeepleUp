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
} from 'react-native';

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
        <Pressable style={styles.overlay} onPress={fullScreen ? undefined : onClose}>
          <Pressable 
            style={[styles.content, fullScreen && styles.contentFullScreen]} 
            onPress={(e) => e.stopPropagation()}
          >
            {fullScreen ? (
              <View style={styles.fullScreenHeader}>
                <TouchableOpacity onPress={onClose} style={styles.backButton}>
                  <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
                {title && <Text style={styles.fullScreenTitle}>{title}</Text>}
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.header}>
                {title && <Text style={styles.title}>{title}</Text>}
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Text style={styles.closeText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {fullScreen ? (
              children
            ) : (
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
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
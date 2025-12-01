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
            <View style={styles.header}>
              {title && <Text style={styles.title}>{title}</Text>}
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  closeButton: {
    padding: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  closeText: {
    fontSize: 28,
    color: '#666',
    lineHeight: 28,
  },
});

export default Modal;
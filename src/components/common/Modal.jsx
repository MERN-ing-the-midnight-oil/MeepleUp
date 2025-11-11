import React from 'react';
import {
  Modal as RNModal,
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';

const Modal = ({ isOpen, onClose, children, title }) => {
    return (
    <RNModal
      visible={isOpen}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            {title && <Text style={styles.title}>{title}</Text>}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>
                {children}
        </Pressable>
      </Pressable>
    </RNModal>
    );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
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
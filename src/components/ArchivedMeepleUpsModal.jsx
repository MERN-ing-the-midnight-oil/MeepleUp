import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Modal from './common/Modal';
import Button from './common/Button';
import { theme } from '../utils/theme';
import { formatDate } from '../utils/helpers';
import logger from '../utils/logger';

const ArchivedMeepleUpsModal = ({ isOpen, onClose, archivedEvents, onDelete, currentUserId }) => {
  const [deletingIds, setDeletingIds] = useState(new Set());

  const handleDelete = (event) => {
    if (!event || !event.id) {
      console.warn('[ArchivedMeepleUpsModal] handleDelete called with invalid event:', event);
      return;
    }

    logger.debug('[ArchivedMeepleUpsModal] handleDelete called for event:', event.id, event.name);
    Alert.alert(
      'Delete MeepleUp Forever?',
      `Are you sure you want to permanently delete "${event.name}"? This cannot be undone. All data will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            logger.debug('[ArchivedMeepleUpsModal] Delete confirmed, calling onDelete:', event.id, currentUserId);
            try {
              setDeletingIds(prev => new Set(prev).add(event.id));
              await onDelete(event.id, currentUserId);
              logger.debug('[ArchivedMeepleUpsModal] Delete successful');
              Alert.alert(
                'Deleted',
                `"${event.name}" has been permanently deleted.`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      onClose();
                    },
                  },
                ]
              );
            } catch (error) {
              console.error('[ArchivedMeepleUpsModal] Error deleting MeepleUp:', error);
              Alert.alert('Error', error.message || 'Failed to delete MeepleUp. Please try again.');
              setDeletingIds(prev => {
                const next = new Set(prev);
                next.delete(event.id);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Archived MeepleUps">
      <View style={styles.container}>
        {archivedEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="archive" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No archived MeepleUps</Text>
            <Text style={styles.emptySubtext}>Archived MeepleUps will appear here</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {archivedEvents.map((event) => {
              const isDeleting = deletingIds.has(event.id);
              const location = event.location || event.generalLocation || event.address || event.exactLocation || '';
              const dateStr = event.scheduledFor ? formatDate(event.scheduledFor) : null;
              
              return (
                <View key={event.id} style={styles.eventItem}>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventName}>{event.name || 'Untitled MeepleUp'}</Text>
                    {location && (
                      <Text style={styles.eventLocation}>{location}</Text>
                    )}
                    {dateStr && (
                      <Text style={styles.eventDate}>{dateStr}</Text>
                    )}
                    <Text style={styles.archivedLabel}>Archived</Text>
                  </View>
                  <View style={styles.eventActions}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={theme.colors.meepleRed} />
                    ) : (
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => {
                          logger.debug('[ArchivedMeepleUpsModal] Delete button pressed for event:', event.id);
                          handleDelete(event);
                        }}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="delete-forever" size={20} color={theme.colors.error || '#d32f2f'} />
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.footer}>
          <Button label="Close" onPress={onClose} variant="outline" />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  listContainer: {
    gap: theme.spacing.md,
  },
  eventItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.woodLight,
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
    borderRadius: theme.borderRadius.md,
  },
  eventInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  eventName: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  eventLocation: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  eventDate: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  archivedLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  eventActions: {
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.error || '#d32f2f',
    backgroundColor: '#fff',
    minHeight: 36,
  },
  deleteButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.error || '#d32f2f',
  },
  footer: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.woodMedium,
  },
});

export default ArchivedMeepleUpsModal;


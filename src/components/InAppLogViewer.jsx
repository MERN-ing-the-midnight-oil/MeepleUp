import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  TextInput,
} from 'react-native';
import logger from '../utils/inAppLogger';
import { theme } from '../utils/theme';

const InAppLogViewer = ({ visible, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'info', 'warn', 'error', 'debug'
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Subscribe to log updates
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    // Get initial logs
    setLogs(logger.getLogs());

    return unsubscribe;
  }, []);

  const filteredLogs = logs.filter(log => {
    // Filter by level
    if (filter !== 'all' && log.level !== filter) {
      return false;
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(query) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(query))
      );
    }

    return true;
  });

  const handleShare = async () => {
    try {
      const logText = filteredLogs.map(log => log.displayText).join('\n\n');
      await Share.share({
        message: `MeepleUp Debug Logs\n\n${logText}`,
        title: 'Debug Logs',
      });
    } catch (error) {
      logger.error('Failed to share logs', error);
    }
  };

  const handleClear = () => {
    logger.clear();
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'error': return '#e74c3c';
      case 'warn': return '#f39c12';
      case 'info': return '#3498db';
      case 'debug': return '#95a5a6';
      default: return '#333';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Debug Logs</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleShare} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Share</Text>
            </Pressable>
            <Pressable onPress={handleClear} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Clear</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {['all', 'info', 'warn', 'error', 'debug'].map(level => (
              <Pressable
                key={level}
                onPress={() => setFilter(level)}
                style={[
                  styles.filterButton,
                  filter === level && styles.filterButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filter === level && styles.filterButtonTextActive,
                  ]}
                >
                  {level.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            style={styles.searchInput}
            placeholder="Search logs..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView style={styles.logsContainer} contentContainerStyle={styles.logsContent}>
          {filteredLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {searchQuery ? 'No logs match your search' : 'No logs yet'}
              </Text>
            </View>
          ) : (
            filteredLogs.map((log) => (
              <View key={log.id} style={styles.logEntry}>
                <View style={styles.logHeader}>
                  <View
                    style={[
                      styles.logLevelBadge,
                      { backgroundColor: getLevelColor(log.level) },
                    ]}
                  >
                    <Text style={styles.logLevelText}>{log.level.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.logTime}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <Text style={styles.logMessage}>{log.message}</Text>
                {log.data && (
                  <View style={styles.logData}>
                    <Text style={styles.logDataText}>
                      {typeof log.data === 'object'
                        ? JSON.stringify(log.data, null, 2)
                        : String(log.data)}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {filteredLogs.length} of {logs.length} logs
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: theme.colors.meepleRed,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  filters: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  filterRow: {
    marginBottom: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterButtonActive: {
    backgroundColor: theme.colors.meepleRed,
    borderColor: theme.colors.meepleRed,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  logsContainer: {
    flex: 1,
  },
  logsContent: {
    padding: 12,
  },
  logEntry: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  logLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logLevelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  logTime: {
    fontSize: 11,
    color: '#999',
  },
  logMessage: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  logData: {
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 8,
    marginTop: 4,
  },
  logDataText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#666',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
  },
  footer: {
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});

export default InAppLogViewer;


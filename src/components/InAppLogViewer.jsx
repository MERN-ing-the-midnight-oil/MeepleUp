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
  Clipboard,
  Platform,
  Alert,
} from 'react-native';
import logger from '../utils/inAppLogger';
import debugLogger from '../utils/logger';
import { horizontalScrollViewProps } from '../utils/horizontalScrollViewProps';
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

  const handleCopyAllAndShare = async () => {
    try {
      // Get all logs (not just filtered ones)
      const allLogText = logs.map(log => log.displayText).join('\n\n');
      const fullLogText = `MeepleUp Debug Logs\n\nTotal Logs: ${logs.length}\n\n${allLogText}`;
      
      // Copy to clipboard
      let copied = false;
      if (Platform.OS === 'web') {
        // For web, use the Clipboard API
        try {
          await navigator.clipboard.writeText(fullLogText);
          copied = true;
        } catch (clipError) {
          // Fallback: try to use Share API
          if (__DEV__) {
            debugLogger.debug('Clipboard API not available, using Share instead');
          }
        }
      } else {
        // For React Native, try Clipboard (may be deprecated but might still work)
        try {
          if (Clipboard && Clipboard.setString) {
            Clipboard.setString(fullLogText);
            copied = true;
          }
        } catch (clipError) {
          // Clipboard not available, will use Share instead
          if (__DEV__) {
            debugLogger.debug('Clipboard not available, using Share instead');
          }
        }
      }
      
      // Try to share (this works on both web and mobile)
      try {
        const shareResult = await Share.share({
          message: fullLogText,
          title: 'MeepleUp Debug Logs',
        });
        
        if (copied) {
          // Show success message after share completes
          setTimeout(() => {
            Alert.alert('Success', 'Logs copied to clipboard and shared!');
          }, 500);
        }
      } catch (shareError) {
        // If share fails but we copied, that's okay
        if (copied) {
          Alert.alert('Copied!', 'All logs have been copied to clipboard. Share dialog was not available.');
        } else {
          // Neither worked
          throw new Error('Both clipboard and share failed');
        }
      }
    } catch (error) {
      logger.error('Failed to copy and share logs', error);
      Alert.alert('Error', 'Failed to copy logs. Please try the "Share Filtered" button instead.');
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
            <Pressable onPress={handleCopyAllAndShare} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Copy All & Share</Text>
            </Pressable>
            <Pressable onPress={handleShare} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Share Filtered</Text>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} {...horizontalScrollViewProps}>
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
                    {typeof log.data === 'object' ? (
                      <View>
                        {/* Display try counts prominently if available */}
                        {(log.data.firebaseTries !== undefined || log.data.bggTries !== undefined) && (
                          <View style={styles.tryCountsContainer}>
                            <Text style={styles.tryCountsLabel}>Try Counts:</Text>
                            <View style={styles.tryCountsRow}>
                              {log.data.firebaseTries !== undefined && (
                                <Text style={styles.tryCountText}>
                                  Firebase: <Text style={styles.tryCountNumber}>{log.data.firebaseTries}</Text>
                                </Text>
                              )}
                              {log.data.bggTries !== undefined && (
                                <Text style={styles.tryCountText}>
                                  BGG: <Text style={styles.tryCountNumber}>{log.data.bggTries}</Text>
                                </Text>
                              )}
                              {log.data.totalTries !== undefined && (
                                <Text style={styles.tryCountText}>
                                  Total: <Text style={styles.tryCountNumber}>{log.data.totalTries}</Text>
                                </Text>
                              )}
                            </View>
                          </View>
                        )}
                        {/* Display rank prominently if available */}
                        {log.data.rank !== undefined && log.data.rank !== 'N/A' && (
                          <View style={styles.rankContainer}>
                            <Text style={styles.rankLabel}>
                              BGG Rank: <Text style={styles.rankNumber}>{log.data.rank}</Text>
                            </Text>
                          </View>
                        )}
                        {/* Display game title if available */}
                        {log.data.gameTitle && (
                          <Text style={styles.gameTitleText}>
                            <Text style={styles.gameTitleLabel}>Game: </Text>
                            {log.data.gameTitle}
                          </Text>
                        )}
                        {/* Display remaining data */}
                        <Text style={styles.logDataText}>
                          {JSON.stringify(log.data, null, 2)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.logDataText}>
                        {String(log.data)}
                      </Text>
                    )}
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
  tryCountsContainer: {
    backgroundColor: '#e8f4f8',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  tryCountsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  tryCountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tryCountText: {
    fontSize: 13,
    color: '#34495e',
    fontWeight: '600',
  },
  tryCountNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2980b9',
  },
  rankContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f39c12',
  },
  rankLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#856404',
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#d68910',
  },
  gameTitleText: {
    fontSize: 13,
    color: '#2c3e50',
    marginBottom: 8,
    fontWeight: '600',
  },
  gameTitleLabel: {
    fontWeight: '700',
    color: '#34495e',
  },
});

export default InAppLogViewer;


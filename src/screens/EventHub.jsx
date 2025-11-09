import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';

const EventHub = () => {
  const route = useRoute();
  const { eventId, joinCode } = route.params || {};

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Event Hub</Text>
        <Text style={styles.subtitle}>
          Welcome to the Event Hub! Here you can see attendees and the collective game library.
        </Text>

        {eventId && <Text style={styles.eventId}>Event ID: {eventId}</Text>}

        {joinCode && (
          <View style={styles.joinCodeCard}>
            <Text style={styles.joinCodeLabel}>Share this join code</Text>
            <Text style={styles.joinCodeValue}>{joinCode}</Text>
            <Text style={styles.joinCodeHint}>
              Anyone with this code can join your event from the onboarding screen.
            </Text>
          </View>
        )}

        {/* Additional functionality for displaying attendees and game library will be implemented here */}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  eventId: {
    fontSize: 14,
    color: '#999',
    marginTop: 16,
  },
  joinCodeCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#eef3ff',
    borderWidth: 1,
    borderColor: '#c7d4ff',
  },
  joinCodeLabel: {
    fontSize: 14,
    color: '#4a5ec5',
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  joinCodeValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1f2a75',
    letterSpacing: 2,
  },
  joinCodeHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#4a5ec5',
  },
});

export default EventHub;

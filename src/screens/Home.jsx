import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventsContext';
import { formatDate } from '../utils/helpers';
import Button from '../components/common/Button';

const Home = () => {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { getUserEvents } = useEvents();
  
  const userIdentifier = user?.uid || user?.id;
  const userEvents = userIdentifier ? getUserEvents(userIdentifier) : [];

  const handleEventClick = (eventId) => {
    navigation.navigate('EventHub', { eventId });
  };

  const handleCreateEvent = () => {
    // Navigate to create event page (to be implemented)
    alert('Create event feature coming soon!');
  };

    return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Welcome{user?.name ? `, ${user.name}` : ''}!
        </Text>
        <Text style={styles.subtitle}>Your game night events</Text>
      </View>

      {userEvents.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No events yet</Text>
          <Text style={styles.emptyText}>
            Join an event with a code or discover public events nearby.
          </Text>
          <View style={styles.emptyActions}>
            <Button
              label="Discover Events"
              onPress={() => navigation.navigate('Discover')}
              style={styles.fullButton}
            />
            <Button
              label="Create Event"
              onPress={handleCreateEvent}
              variant="outline"
              style={[styles.fullButton, styles.createButton]}
            />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.eventsGrid}>
            {userEvents.map((event) => {
              const memberCount = (event.members || []).filter(
                (member) => member.status === 'member',
              ).length;

              return (
                <Pressable
                  key={event.id}
                  style={styles.eventTile}
                  onPress={() => handleEventClick(event.id)}
                >
                <View style={styles.eventHeader}>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>
                      {event.name || 'Untitled Event'}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {event.location || 'Location TBD'}
                    </Text>
                  </View>
                  {event.type === 'private' && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Private</Text>
                    </View>
                  )}
                </View>
                {event.nextDate && (
                  <Text style={styles.eventDate}>
                    Next: {formatDate(event.nextDate)}
                  </Text>
                )}
                {event.members && (
                  <Text style={styles.eventMembers}>
                    {memberCount} member{memberCount !== 1 ? 's' : ''}
                  </Text>
                )}
                </Pressable>
              );
            })}
          </View>
          
          <View style={styles.createSection}>
            <Button
              label="+ Create New Event"
              onPress={handleCreateEvent}
              variant="outline"
              style={styles.fullButton}
            />
          </View>
        </>
      )}
    </ScrollView>
    );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d45d5d',
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyActions: {
    width: '100%',
  },
  fullButton: {
    width: '100%',
  },
  createButton: {
    marginTop: 12,
  },
  eventsGrid: {
    padding: 20,
  },
  eventTile: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 14,
    color: '#666',
  },
  badge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  eventDate: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
  },
  eventMembers: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  createSection: {
    padding: 20,
    paddingTop: 0,
  },
});

export default Home;
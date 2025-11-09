import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

const EventDiscovery = () => {
    return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Event Discovery</Text>
        <Text style={styles.subtitle}>
          Browse public events happening nearby.
        </Text>
            {/* Additional functionality for browsing events will be implemented here */}
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
});

export default EventDiscovery;

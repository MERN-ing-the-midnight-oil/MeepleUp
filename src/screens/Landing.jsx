import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Button from '../components/common/Button';

const Landing = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>MeepleUp</Text>
        <Text style={styles.subtitle}>
          Connect with your board game community
        </Text>
        
        <View style={styles.actions}>
          <Button
            label="Sign In"
            onPress={() => navigation.navigate('Auth', { mode: 'login' })}
            style={styles.button}
          />
          <Button
            label="Create Account"
            onPress={() => navigation.navigate('Auth', { mode: 'register' })}
            variant="outline"
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#d45d5d',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 48,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: 16,
  },
  button: {
    width: '100%',
  },
});

export default Landing;


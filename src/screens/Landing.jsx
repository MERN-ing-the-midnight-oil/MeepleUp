import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Button from '../components/common/Button';

const LandingScreen = ({ navigation }) => {
  const handleNavigate = (mode) => {
    navigation.navigate('Auth', { mode });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {navigation.canGoBack() && (
          <Pressable onPress={() => navigation.goBack()} accessibilityRole="button">
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>MeepleUp</Text>
        <Text style={styles.subtitle}>Game on.</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Register" onPress={() => handleNavigate('signup')} style={styles.actionButton} />
        <Button
          label="Login"
          onPress={() => handleNavigate('login')}
          variant="outline"
          style={styles.actionButton}
        />
      </View>

      <Text style={styles.footerText}>Already have an account? Jump back in!</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 32,
    backgroundColor: '#f5f5f5',
    justifyContent: 'space-between',
  },
  headerRow: {
    minHeight: 24,
  },
  backText: {
    color: '#4a90e2',
    fontSize: 16,
    fontWeight: '600',
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#d45d5d',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  actions: {
    gap: 16,
    marginBottom: 24,
  },
  actionButton: {
    width: '100%',
  },
  footerText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
  },
});

export default LandingScreen;



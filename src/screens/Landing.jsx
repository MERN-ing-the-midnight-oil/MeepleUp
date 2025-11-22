import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Button from '../components/common/Button';
import { bggLogoColor } from '../components/BGGLogoAssets';

const Landing = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image 
          source={require('../../assets/images/app-icon.png')} 
          style={styles.meepleUpLogo}
          resizeMode="contain"
        />
        <Text style={styles.title}>MeepleUp</Text>
        <Image 
          source={bggLogoColor} 
          style={styles.bggLogo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>
          Evolve your tabletop socials
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
  meepleUpLogo: {
    width: 120,
    height: 120,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#d45d5d',
    marginBottom: 16,
    textAlign: 'center',
  },
  bggLogo: {
    width: 200,
    height: 60,
    alignSelf: 'center',
    marginBottom: 16,
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


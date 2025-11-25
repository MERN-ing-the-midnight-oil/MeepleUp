import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Button from '../components/common/Button';
import { bggLogoColor } from '../components/BGGLogoAssets';

const Landing = () => {
  const navigation = useNavigation();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const isMobile = screenWidth < 600;

  // Calculate logo size to fill available space with reasonable padding
  const availableHeight = screenHeight;
  const padding = isMobile ? 40 : 60;
  const otherElementsHeight = isMobile ? 350 : 450; // Approximate height of other elements
  const maxLogoSize = Math.min(
    availableHeight - otherElementsHeight - padding,
    isMobile ? screenWidth * 0.7 : Math.min(screenWidth * 0.5, 400)
  );
  const logoSize = Math.max(maxLogoSize, isMobile ? 150 : 200);

  const dynamicStyles = {
    logoContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: isMobile ? 150 : 200,
      paddingVertical: isMobile ? 20 : 40,
    },
    meepleUpLogo: {
      width: logoSize,
      height: logoSize,
      alignSelf: 'center',
    },
    title: {
      fontSize: isMobile ? 36 : 56,
      fontWeight: 'bold',
      color: '#d45d5d',
      marginBottom: 16,
      textAlign: 'center',
      paddingHorizontal: isMobile ? 20 : 0,
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={dynamicStyles.logoContainer}>
          <Image 
            source={require('../../assets/images/app-icon.png')} 
            style={[styles.meepleUpLogo, dynamicStyles.meepleUpLogo]}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.title, dynamicStyles.title]}>MeepleUp</Text>
        <Image 
          source={bggLogoColor} 
          style={styles.bggLogo}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>
        Is it tabletop o'clock yet?
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
    maxWidth: 500,
    padding: 40,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  meepleUpLogo: {
    alignSelf: 'center',
  },
  title: {
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


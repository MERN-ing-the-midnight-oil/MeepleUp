import React from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Button from '../components/common/Button';
import KeyboardAwareScrollView from '../components/common/KeyboardAwareScrollView';

const Landing = () => {
  const navigation = useNavigation();
  const { width: screenWidth } = Dimensions.get('window');
  const isMobile = screenWidth < 600;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAwareScrollView
        style={styles.keyboardAvoidingView}
        contentContainerStyle={[styles.scrollContainer, { paddingBottom: isMobile ? 40 : 80 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={[styles.content, { padding: isMobile ? 20 : 40 }]}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/images/app-icon.png')}
                style={[styles.logo, { width: isMobile ? 100 : 140, height: isMobile ? 100 : 140 }]}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, { fontSize: isMobile ? 26 : 42 }]}>MeepleUp</Text>
            <Text style={[styles.message, { fontSize: isMobile ? 16 : 20, marginTop: isMobile ? 12 : 20 }]}>
              Find board game events and manage your collection.
            </Text>
            <Button
              label="Get started"
              onPress={() => navigation.navigate('Auth', { mode: 'login' })}
              style={styles.submitButton}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: 'transparent',
    paddingBottom: 80,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 440,
    padding: 40,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 12,
  },
  logo: {
    alignSelf: 'center',
  },
  title: {
    fontWeight: 'bold',
    color: '#d45d5d',
    textAlign: 'center',
  },
  message: {
    color: '#2b2b2b',
    textAlign: 'center',
    lineHeight: 24,
  },
  submitButton: {
    width: '100%',
    marginTop: 24,
  },
});

export default Landing;

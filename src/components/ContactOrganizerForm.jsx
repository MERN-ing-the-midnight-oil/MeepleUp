import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Input from './common/Input';
import Button from './common/Button';

const DEFAULT_MESSAGE_TEMPLATE =
  "Hi! I'm interested in joining your game night. I'd love to stop by and meet the group. Let me know the best way to connect before the event.";

const ContactOrganizerForm = ({
  onSubmit,
  onCancel,
  initialName = '',
  initialEmail = '',
  initialMessage = '',
  loading = false,
}) => {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState(initialMessage || DEFAULT_MESSAGE_TEMPLATE);
  const [error, setError] = useState('');

  const isDisabled = useMemo(
    () => loading || !name.trim() || !email.trim(),
    [loading, name, email],
  );

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) {
      setError('Please share your name and preferred contact info so the organizer can reach you.');
      return;
    }
    setError('');
    onSubmit?.({
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
    });
  };

  return (
    <View>
      <Text style={styles.lead}>
        Introduce yourself and how you&apos;d like the organizer to follow up. They&apos;ll send the
        private invite link once you&apos;ve met or chatted.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Input
        placeholder="Your name"
        value={name}
        onChangeText={setName}
        style={styles.input}
        autoCapitalize="words"
        disabled={loading}
      />
      <Input
        placeholder="Email or phone number"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        disabled={loading}
      />
      <Input
        placeholder="Say hello and share anything helpful"
        value={message}
        onChangeText={setMessage}
        style={[styles.input, styles.messageInput]}
        multiline
        numberOfLines={4}
        disabled={loading}
      />

      <View style={styles.actions}>
        <Button
          label="Cancel"
          onPress={onCancel}
          variant="outline"
          style={styles.button}
          disabled={loading}
        />
        <Button
          label={loading ? 'Sending...' : 'Send request'}
          onPress={handleSubmit}
          style={styles.button}
          disabled={isDisabled}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  lead: {
    fontSize: 14,
    color: '#4a4a4a',
    marginBottom: 16,
    lineHeight: 20,
  },
  error: {
    color: '#d32f2f',
    fontSize: 13,
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  messageInput: {
    minHeight: 120,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  button: {
    flex: 1,
    marginLeft: 8,
  },
});

export default ContactOrganizerForm;










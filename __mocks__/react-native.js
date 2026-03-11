// React Native mock for Jest - provides React components that render to DOM for @testing-library/react
const React = require('react');

const Platform = {
  OS: 'web',
  select: (obj) => obj.web ?? obj.default,
};

const Dimensions = {
  get: jest.fn(() => ({ width: 390, height: 844 })),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

// Components that render to DOM so @testing-library/react can find them
const View = (props) => React.createElement('div', { ...props, 'data-testid': props.testID });
const Text = (props) => React.createElement('span', props, props.children);
const ScrollView = (props) => React.createElement('div', { ...props, role: 'scroll' }, props.children);
const Pressable = (props) =>
  React.createElement(
    'button',
    { ...props, onClick: props.onPress, type: 'button', 'aria-label': props.accessibilityLabel },
    props.children
  );
const TextInput = (props) =>
  React.createElement('input', {
    ...props,
    onChange: (e) => props.onChangeText?.(e.target.value),
    'data-testid': props.testID,
  });
const ActivityIndicator = () => React.createElement('div', { 'aria-label': 'Loading' });
const Modal = (props) => (props.visible ? React.createElement('div', {}, props.children) : null);
const TouchableOpacity = (props) =>
  React.createElement('button', { ...props, onClick: props.onPress }, props.children);
const KeyboardAvoidingView = (props) => React.createElement('div', props, props.children);

const useWindowDimensions = () => ({ width: 390, height: 844 });

const StyleSheet = {
  create: (styles) => styles,
};

module.exports = {
  Platform,
  Dimensions,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  useWindowDimensions,
};

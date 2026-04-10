import { Platform } from 'react-native';

/**
 * Spread onto horizontal ScrollViews so child Pressables / long-press handlers work reliably on iOS.
 * Default UIScrollView behavior delays content touches to disambiguate scroll vs tap, which often
 * prevents long-press and makes taps feel flaky inside horizontal carousels.
 */
export const horizontalScrollViewProps = {
  keyboardShouldPersistTaps: 'handled',
  ...(Platform.OS === 'ios' ? { delayContentTouches: false } : {}),
};

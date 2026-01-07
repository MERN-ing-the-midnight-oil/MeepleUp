import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { theme } from '../utils/theme';
import logger from '../utils/logger';
import Button from './common/Button';

class ErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      errorId: Date.now(), // Unique ID for this error instance
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to tracking service
    logger.error('ErrorBoundary caught an error:', error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: this.props.name || 'Unknown',
    });
    
    this.setState({
      error,
      errorInfo,
    });

    // Send to error tracking service (when integrated)
    // This is prepared for Sentry/LogRocket integration
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
        tags: {
          errorBoundary: this.props.name || 'Unknown',
        },
      });
    }
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null,
    });
  };

  handleGoHome = () => {
    this.handleReset();
    if (this.props.onNavigateHome) {
      this.props.onNavigateHome();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          showDetails={__DEV__}
          onReset={this.handleReset}
          onGoHome={this.handleGoHome}
          errorBoundaryName={this.props.name}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Error Fallback UI Component
 * Displays user-friendly error message with recovery options
 */
const ErrorFallback = ({ 
  error, 
  errorInfo, 
  showDetails = false,
  onReset,
  onGoHome,
  errorBoundaryName,
}) => {
  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      // Fallback navigation - will be handled by parent
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/events';
      }
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Error Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⚠️</Text>
          </View>

          {/* Error Title */}
          <Text style={styles.title}>Oops! Something went wrong</Text>

          {/* Error Message */}
          <Text style={styles.message}>
            We're sorry, but something unexpected happened. Don't worry, your data is safe!
          </Text>

          {/* Error Details (Development Only) */}
          {showDetails && error && (
            <View style={styles.errorDetails}>
              <Text style={styles.errorDetailsTitle}>Error Details (Development Only)</Text>
              <Text style={styles.errorText}>
                {error.toString()}
              </Text>
              {errorInfo && errorInfo.componentStack && (
                <ScrollView 
                  style={styles.stackScroll}
                  nestedScrollEnabled={true}
                >
                  <Text style={styles.stackText}>
                    {errorInfo.componentStack}
                  </Text>
                </ScrollView>
              )}
              {errorBoundaryName && (
                <Text style={styles.boundaryName}>
                  Error Boundary: {errorBoundaryName}
                </Text>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              label="Try Again"
              onPress={onReset}
              style={styles.button}
            />
            <Button
              label="Go Home"
              onPress={handleGoHome}
              variant="outline"
              style={styles.button}
            />
          </View>

          {/* Help Text */}
          <Text style={styles.helpText}>
            If this problem persists, please contact support or try refreshing the app.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bgColor,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  content: {
    alignItems: 'center',
    maxWidth: Platform.OS === 'web' ? 600 : '100%',
    alignSelf: 'center',
    width: '100%',
  },
  iconContainer: {
    marginBottom: theme.spacing.lg,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.meepleRed,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  message: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.fontSize.base * 1.6,
    paddingHorizontal: theme.spacing.md,
  },
  errorDetails: {
    backgroundColor: theme.colors.woodLight,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderColor: theme.colors.woodMedium,
  },
  errorDetailsTitle: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    marginBottom: theme.spacing.sm,
  },
  stackScroll: {
    maxHeight: 200,
    backgroundColor: theme.colors.surfaceColor,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
  },
  stackText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  boundaryName: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: theme.spacing.xs,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  button: {
    width: '100%',
  },
  helpText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: theme.spacing.md,
  },
});

// Export the class component
const ErrorBoundary = ErrorBoundaryClass;

export default ErrorBoundary;


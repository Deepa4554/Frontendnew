import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WarmColors as COLORS } from '../design/warmTheme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Catches render-time errors anywhere below it in the tree and shows a fallback
// instead of letting the whole app unmount. Does NOT catch errors from event
// handlers, async code (API calls, timers), or native-module crashes — those
// still need their own try/catch since React error boundaries only cover
// render/lifecycle errors.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Icon name="alert-circle-outline" size={48} color={COLORS.dangerAccent} />
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            An unexpected error occurred. You can try again — if it keeps happening, restart the app.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.heading,
    marginTop: 12,
  },
  message: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 6,
    maxWidth: 320,
  },
  button: {
    marginTop: 18,
    backgroundColor: COLORS.button,
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

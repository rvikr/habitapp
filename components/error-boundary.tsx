import { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { reportError } from "@/lib/services/sentry";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View className="flex-1 bg-background dark:bg-d-background items-center justify-center px-margin-mobile">
        <View className="w-16 h-16 rounded-full bg-error-container items-center justify-center mb-lg">
          <Text className="text-headline-lg text-on-error-container">!</Text>
        </View>
        <Text className="text-headline-md text-on-background dark:text-d-on-background font-bold mb-sm text-center">
          Something went wrong
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center mb-lg">
          We've logged the error. Try again, or restart the app if the problem persists.
        </Text>
        <ScrollView className="max-h-32 mb-lg" horizontal>
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant font-mono">
            {this.state.error.message}
          </Text>
        </ScrollView>
        <TouchableOpacity
          className="bg-primary rounded-full px-xl py-sm"
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={this.reset}
        >
          <Text className="text-on-primary text-label-lg font-semibold">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

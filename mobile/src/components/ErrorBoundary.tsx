import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  children: ReactNode;
  /** Optional label for nested boundaries (logs only). */
  label?: string;
}

interface State {
  error: Error | null;
  /** Bumps on retry so children fully remount instead of re-rendering the same crash. */
  retryKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };
  private autoRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private autoRetried = false;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.label ? `[${this.props.label}] ` : "";
    console.error(`BabiTk crash: ${label}`, error, info.componentStack);
    // One automatic remount for transient render crashes (keeps app "alive").
    if (!this.autoRetried) {
      this.autoRetried = true;
      this.autoRetryTimer = setTimeout(() => {
        this.handleRetry();
      }, 800);
    }
  }

  componentWillUnmount(): void {
    if (this.autoRetryTimer) clearTimeout(this.autoRetryTimer);
  }

  private handleRetry = () => {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
      this.autoRetryTimer = null;
    }
    this.setState((prev) => ({
      error: null,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>משהו השתבש</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>נסה שוב</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.fill} key={this.state.retryKey}>
        {this.props.children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fef2f2",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#991b1b",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#7f1d1d",
    marginBottom: 20,
    textAlign: "center",
  },
  button: {
    alignSelf: "center",
    backgroundColor: "#4f46e5",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});

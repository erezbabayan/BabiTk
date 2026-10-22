import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, type ModalProps } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Drop-in replacement for RN <Modal>. Android modals render in their own
 * edge-to-edge window, so bottom-anchored buttons ended up under the system
 * navigation bar. This keeps all content inside the safe area and lifts it
 * above the soft keyboard.
 */
export function SafeModal({ children, ...props }: ModalProps & { children?: ReactNode }) {
  return (
    <Modal statusBarTranslucent navigationBarTranslucent {...props}>
      <SafeAreaProvider>
        <SafeModalBody>{children}</SafeModalBody>
      </SafeAreaProvider>
    </Modal>
  );
}

function SafeModalBody({ children }: { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

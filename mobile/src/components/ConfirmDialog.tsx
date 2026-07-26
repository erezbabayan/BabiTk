import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export type ConfirmVariant = "default" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = "אישור",
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const isDanger = variant === "danger";
  const messageLines = message.split("\n").filter((line) => line.length > 0);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.panel} accessibilityRole="alert">
          <View
            style={[styles.accent, isDanger ? styles.accentDanger : styles.accentDefault]}
          />
          <Text style={styles.title}>{title}</Text>
          <View style={styles.messageBlock}>
            {messageLines.map((line, index) => (
              <Text
                key={`${index}-${line.slice(0, 12)}`}
                style={[styles.message, index > 0 && styles.messageSecondary]}
              >
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, isDanger ? styles.btnDanger : styles.btnDefault]}
              onPress={onConfirm}
            >
              <Text style={styles.btnConfirmText}>{confirmLabel}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnCancel]} onPress={onCancel}>
              <Text style={styles.btnCancelText}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(28, 25, 23, 0.35)",
    paddingHorizontal: 40,
  },
  panel: {
    width: "100%",
    maxWidth: 280,
    backgroundColor: "#fffefb",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(168, 162, 158, 0.55)",
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: "#1c1917",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 2,
    alignItems: "center",
  },
  accent: {
    width: 36,
    height: 3,
    borderRadius: 999,
    marginBottom: 10,
    alignSelf: "center",
  },
  accentDefault: { backgroundColor: "#a8a29e" },
  accentDanger: { backgroundColor: "#f97316" },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1c1917",
    textAlign: "center",
    width: "100%",
  },
  messageBlock: {
    marginTop: 6,
    gap: 4,
    width: "100%",
    alignItems: "center",
  },
  message: {
    fontSize: 12,
    lineHeight: 18,
    color: "#57534e",
    textAlign: "center",
    width: "100%",
  },
  messageSecondary: {
    color: "#78716c",
  },
  actions: {
    marginTop: 14,
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: 8,
    width: "100%",
  },
  btn: {
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    minWidth: 72,
    alignItems: "center",
  },
  btnDefault: {
    backgroundColor: "#1c1917",
    borderColor: "#1c1917",
  },
  btnDanger: {
    backgroundColor: "#ea580c",
    borderColor: "#c2410c",
  },
  btnCancel: {
    backgroundColor: "#fff",
    borderColor: "rgba(168, 162, 158, 0.7)",
  },
  btnConfirmText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  btnCancelText: {
    color: "#44403c",
    fontWeight: "600",
    fontSize: 12,
  },
});

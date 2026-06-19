import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type SearchTone = "slate" | "blue" | "orange";

interface ColumnSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  activeQuery: string;
  onSearch: () => void;
  onClear: () => void;
  placeholder: string;
  tone: SearchTone;
  loading?: boolean;
  inline?: boolean;
}

const TONE: Record<SearchTone, { btn: string; btnText: string; back: string; backText: string; border: string }> =
  {
    slate: { btn: "#fff", btnText: "#334155", back: "#fff", backText: "#334155", border: "#cbd5e1" },
    blue: { btn: "#3b82f6", btnText: "#fff", back: "#fff", backText: "#1d4ed8", border: "#bfdbfe" },
    orange: { btn: "#ea580c", btnText: "#fff", back: "#fff", backText: "#c2410c", border: "#fed7aa" },
  };

export function ColumnSearchAiButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.aiBtn, (loading || disabled) && styles.disabled]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator color="#475569" size="small" />
      ) : (
        <Text style={styles.aiBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ColumnSearchBar({
  value,
  onChange,
  activeQuery,
  onSearch,
  onClear,
  placeholder,
  tone,
  loading = false,
  inline = false,
}: ColumnSearchBarProps) {
  const isActive = activeQuery.trim().length > 0;
  const colors = TONE[tone];

  function handlePrimaryPress() {
    if (isActive) {
      onChange("");
      onClear();
    } else {
      onSearch();
    }
  }

  const shellBorder = { borderColor: "#000" };

  return (
    <View style={[styles.wrap, inline && styles.wrapInline]}>
      <View style={[styles.inputShell, inline && styles.inputShellInline, shellBorder]}>
        <Pressable
          style={[
            styles.embeddedBtn,
            {
              backgroundColor: isActive ? colors.back : colors.btn,
            },
            (isActive || tone === "slate") && styles.embeddedBtnOutline,
          ]}
          onPress={handlePrimaryPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={isActive || tone === "slate" ? colors.backText : "#fff"} size="small" />
          ) : (
            <Text
              style={[
                styles.embeddedBtnText,
                (isActive || tone === "slate") && { color: colors.backText },
              ]}
            >
              {isActive ? "חזור" : "חפש"}
            </Text>
          )}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={value}
          onChangeText={onChange}
          onSubmitEditing={() => {
            if (!isActive) onSearch();
          }}
          returnKeyType="search"
          textAlign="right"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  wrapInline: { marginBottom: 0, flex: 1.35, minWidth: 120, minHeight: 0, alignSelf: "stretch" },
  inputShell: {
    flexDirection: "row",
    alignItems: "stretch",
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
    minHeight: 32,
  },
  inputShellInline: {
    flex: 1,
    width: "100%",
  },
  embeddedBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(0,0,0,0.2)",
    minWidth: 44,
  },
  embeddedBtnOutline: {},
  embeddedBtnText: { color: "#fff", fontWeight: "700", fontSize: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 11,
    backgroundColor: "#fff",
  },
  aiBtn: {
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "#fff",
    minWidth: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBtnText: { color: "#475569", fontWeight: "600", fontSize: 10 },
  disabled: { opacity: 0.5 },
});

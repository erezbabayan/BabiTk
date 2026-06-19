import { Image, StyleSheet, Text, View } from "react-native";
import type { OcrLine } from "../lib/supabase";

interface HighlightedNotebookProps {
  uri: string;
  lines: OcrLine[];
}

export function HighlightedNotebook({ uri, lines }: HighlightedNotebookProps) {
  return (
    <View style={styles.wrap}>
      <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {lines.map((line, index) => (
          <View
            key={`${index}-${line.text}`}
            style={[
              styles.box,
              line.completed ? styles.boxDone : styles.boxOpen,
              {
                left: `${line.bbox.left * 100}%`,
                top: `${line.bbox.top * 100}%`,
                width: `${line.bbox.width * 100}%`,
                height: `${line.bbox.height * 100}%`,
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.legend}>🟨 פתוח · 🟩 בוצע</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", width: "100%", minHeight: 200 },
  image: { width: "100%", height: 72, borderRadius: 8, backgroundColor: "#f8fafc" },
  box: { position: "absolute", borderWidth: 2, borderRadius: 4 },
  boxOpen: { borderColor: "#f59e0b", backgroundColor: "rgba(251,191,36,0.25)" },
  boxDone: { borderColor: "#10b981", backgroundColor: "rgba(52,211,153,0.25)" },
  legend: { marginTop: 8, fontSize: 12, color: "#64748b", textAlign: "right" },
});

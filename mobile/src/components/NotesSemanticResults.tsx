import { StyleSheet, Text, View } from "react-native";

interface SemanticHit {
  id: string;
  title: string;
  content: string;
  similarity: number;
}

interface NotesSemanticResultsProps {
  results: SemanticHit[];
  error: string | null;
}

export function NotesSemanticResults({ results, error }: NotesSemanticResultsProps) {
  if (error) {
    return <Text style={styles.error}>{error}</Text>;
  }

  if (results.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>תוצאות חיפוש סמנטי</Text>
      {results.map((r) => (
        <View key={r.id} style={styles.hit}>
          <Text style={styles.similarity}>דמיון: {(r.similarity * 100).toFixed(0)}%</Text>
          <Text style={styles.hitTitle}>{r.title}</Text>
          <Text style={styles.hitBody} numberOfLines={2}>
            {r.content}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  heading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9a3412",
    textAlign: "right",
    marginBottom: 6,
  },
  error: { color: "#dc2626", fontSize: 12, marginBottom: 8, textAlign: "right" },
  hit: {
    marginTop: 6,
    padding: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  similarity: { fontSize: 10, color: "#c2410c", textAlign: "right" },
  hitTitle: { fontWeight: "700", textAlign: "right", marginTop: 2 },
  hitBody: { color: "#64748b", fontSize: 13, textAlign: "right", marginTop: 4 },
});

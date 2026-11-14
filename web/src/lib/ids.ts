/**
 * String id tagged with its table name. This used to come from Convex's
 * generated dataModel; BabiTk no longer uses Convex, so it is a plain
 * (Supabase/demo) string id with an optional compile-time tag.
 */
export type Id<TableName extends string = string> = string & {
  readonly __tableName?: TableName;
};

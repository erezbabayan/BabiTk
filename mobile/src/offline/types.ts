export type OfflineActionType =
  | "approve"
  | "complete"
  | "soft_delete"
  | "restore"
  | "snooze"
  | "update_tags";

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  itemId: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export const CACHE_KEYS = {
  inbox: "mindtasker:cache:inbox",
  today: "mindtasker:cache:today",
  notes: "mindtasker:cache:notes",
  queue: "mindtasker:queue:actions",
} as const;

import { z } from "zod";

export const nluTaskPayloadSchema = z.object({
  task: z.string().trim().min(1, "task is required"),
  context: z.array(z.string().trim().min(1)).default([]),
  reminder_datetime: z.string().trim().min(1).optional(),
  original_transcription: z.string().trim().min(1, "original_transcription is required"),
});

export type NluTaskPayload = z.infer<typeof nluTaskPayloadSchema>;

export type NluTaskErrorCode =
  | "validation_error"
  | "user_not_found"
  | "user_inactive"
  | "invalid_date"
  | "database_error";

export interface NluTaskSuccess {
  success: true;
  itemId: string;
  responseText: string;
  title: string;
  dueDate: string;
}

export interface NluTaskFailure {
  success: false;
  code: NluTaskErrorCode;
  message: string;
}

export type NluTaskIntegrationResult = NluTaskSuccess | NluTaskFailure;

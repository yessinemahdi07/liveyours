export type TaskCategory = "Study" | "Project" | "Gym" | "Life" | "General";
export type ActivityType = "Gym" | "Run" | "Study";
export type TransactionType = "expense" | "income";
export type ChatMode = "quick" | "study" | "projects" | "therapist";

export interface Task {
  id: number;
  text: string;
  done: boolean;
  category: string | null;
  description: string | null;
  created_at: string;
  target_month?: string | null;
}

export interface Conversation {
  id: number;
  title: string | null;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FinanceSummary {
  monthly_balance: number;
  expenses: number;
  remaining: number;
}

export interface FinanceBreakdownItem {
  category: string;
  value: number;
}

export interface Transaction {
  id: number;
  amount: number;
  type: TransactionType;
  category: string | null;
  description: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  type: string;
  distance: number;
  duration_minutes: number;
  description: string | null;
  created_at: string;
}

export interface SleepLog {
  hours: number;
  quality: number;
  date: string;
}

export interface FileSummary {
  id: number;
  filename: string;
}

export interface AnalyticsRow {
  date: string;
  Gym: number;
  Study: number;
  Run: number;
}

export interface AnalyticsSummary {
  total_hours: number;
  previous_total_hours: number;
  change_hours: number;
  change_percent: number | null;
  hours_by_activity: Record<"Gym" | "Study" | "Run", number>;
}

export interface AnalyticsResponse {
  series: AnalyticsRow[];
  summary: AnalyticsSummary;
}

export interface Flashcard {
  q: string;
  a: string;
}

export interface FlashcardResponse {
  flashcards: Flashcard[];
  source_note?: string;
}

export interface UploadResponse {
  success: true;
  files: string[];
  notices?: string[];
}

export interface ChatResponse {
  reply: string;
  conversation_id: number;
  attachment_notice?: string;
}

export interface StandupResponse {
  standup: string;
}

export interface TripPlanResponse {
  trip_plan: string;
  distance_km: number;
  fuel_liters: number;
  fuel_cost_tnd: number;
  ai_generated?: boolean;
  notice?: string;
}

export interface PrivacySettings {
  cloud_ai_fallback: boolean;
  ai_mode: "local-only" | "cloud-fallback";
}

export interface AuthSession {
  authenticated: boolean;
}

export interface SuccessResponse {
  success: boolean;
}

export type DeletableKind = "task" | "transaction" | "activity" | "conversation" | "file";

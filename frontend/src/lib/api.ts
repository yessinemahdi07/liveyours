import type {
  ActivityLog, ActivityType, AnalyticsResponse, AnalyticsRow, AuthSession, ChatMessage, ChatMode, ChatResponse,
  Conversation, DeletableKind, FileSummary, FinanceBreakdownItem, FinanceSummary,
  FlashcardResponse, PrivacySettings, SleepLog, StandupResponse, SuccessResponse, UploadResponse,
  Task, Transaction, TransactionType, TripPlanResponse,
} from "./contracts";

type JsonBody = Record<string, unknown>;
type Guard<T> = (value: unknown) => value is T;

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export const AUTH_EXPIRED_EVENT = "liveyours:auth-expired";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isNullableText = (value: unknown): value is string | null => value === null || isText(value);
const isSuccess = (value: unknown): value is SuccessResponse => isRecord(value) && value.success === true;
const isUploadResponse = (value: unknown): value is UploadResponse => isRecord(value) && value.success === true && Array.isArray(value.files) && value.files.every(isText) && (value.notices === undefined || (Array.isArray(value.notices) && value.notices.every(isText)));
const isTask = (value: unknown): value is Task => isRecord(value) && isNumber(value.id) && isText(value.text) && typeof value.done === "boolean" && isNullableText(value.category) && isNullableText(value.description) && isText(value.created_at) && (value.target_month === undefined || isNullableText(value.target_month));
const isConversation = (value: unknown): value is Conversation => isRecord(value) && isNumber(value.id) && isNullableText(value.title) && isText(value.created_at);
const isChatMessage = (value: unknown): value is ChatMessage => isRecord(value) && (value.role === "user" || value.role === "assistant") && isText(value.content);
const isTransaction = (value: unknown): value is Transaction => isRecord(value) && isNumber(value.id) && isNumber(value.amount) && (value.type === "expense" || value.type === "income") && isNullableText(value.category) && isNullableText(value.description) && isText(value.created_at);
const isActivity = (value: unknown): value is ActivityLog => isRecord(value) && isNumber(value.id) && isText(value.type) && isNumber(value.duration_minutes) && isNumber(value.distance) && isText(value.created_at) && isNullableText(value.description);
const isFile = (value: unknown): value is FileSummary => isRecord(value) && isNumber(value.id) && isText(value.filename);
const isBreakdown = (value: unknown): value is FinanceBreakdownItem => isRecord(value) && isNullableText(value.category) && isNumber(value.value);
const isAnalyticsRow = (value: unknown): value is AnalyticsRow => isRecord(value) && isText(value.date) && isNumber(value.Gym) && isNumber(value.Study) && isNumber(value.Run);
const isAnalyticsResponse = (value: unknown): value is AnalyticsResponse => isRecord(value) && Array.isArray(value.series) && value.series.every(isAnalyticsRow) && isRecord(value.summary) && isNumber(value.summary.total_hours) && isNumber(value.summary.previous_total_hours) && isNumber(value.summary.change_hours) && (value.summary.change_percent === null || isNumber(value.summary.change_percent)) && isRecord(value.summary.hours_by_activity) && isNumber(value.summary.hours_by_activity.Gym) && isNumber(value.summary.hours_by_activity.Study) && isNumber(value.summary.hours_by_activity.Run);

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const message = isRecord(payload) && (isText(payload.error) || isText(payload.reply))
      ? String(payload.error || payload.reply)
      : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

async function requestArray<T>(url: string, guard: Guard<T>): Promise<T[]> {
  const payload = await request<unknown>(url);
  if (!Array.isArray(payload) || !payload.every(guard)) {
    throw new Error(`The server returned an unexpected response for ${url}.`);
  }
  return payload;
}

async function requestObject<T>(url: string, guard: Guard<T>, init?: RequestInit): Promise<T> {
  const payload = await request<unknown>(url, init);
  if (!guard(payload)) throw new Error(`The server returned an unexpected response for ${url}.`);
  return payload;
}

function postJson<T>(url: string, body: JsonBody): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isFinanceSummary(value: unknown): value is FinanceSummary {
  return isRecord(value) && isNumber(value.monthly_balance) && isNumber(value.expenses) && isNumber(value.remaining);
}

export const api = {
  getAuthSession: (signal?: AbortSignal) => requestObject("/api/auth/session", isAuthSession, { signal }),
  login: (username: string, password: string) => postJson<SuccessResponse>("/api/auth/login", { username, password }),
  logout: () => postJson<SuccessResponse>("/api/auth/logout", {}),
  getConversations: () => requestArray("/api/conversations", isConversation),
  getConversationMessages: (id: number) => requestArray(`/api/conversations/${id}`, isChatMessage),
  deleteConversation: (id: number) => requestObject(`/api/conversations/${id}`, isSuccess, { method: "DELETE" }),
  chat: (message: string, mode: ChatMode, conversation_id: number | null, files: File[] = []) => {
    const formData = new FormData();
    formData.append("message", message);
    formData.append("mode", mode);
    if (conversation_id) formData.append("conversation_id", conversation_id.toString());
    files.forEach((file) => formData.append("files", file));
    return requestObject("/api/chat", isChatResponse, { method: "POST", body: formData });
  },
  getTasks: () => requestArray("/api/tasks", isTask),
  getCompletedTasks: () => requestArray("/api/tasks/completed", isCompletedTask),
  addTask: (text: string, category: string, description = "", target_month?: string) => postJson<SuccessResponse>("/api/tasks", { text, category, description, ...(target_month ? { target_month } : {}) }),
  toggleTask: (id: number) => postJson<{ success: true; done: boolean }>("/api/tasks/toggle", { id }),
  deleteTask: (id: number) => requestObject(`/api/tasks/${id}`, isSuccess, { method: "DELETE" }),
  updateTask: (id: number, text: string, category: string, description: string, target_month?: string) => postJson<SuccessResponse>("/api/tasks/update", { id, text, category, description, ...(target_month ? { target_month } : {}) }),
  restoreDeleted: (kind: DeletableKind, id: number) => postJson<SuccessResponse>(`/api/undo/${kind}/${id}`, {}),
  getAnalytics: async (period: "week" | "month"): Promise<AnalyticsResponse> => {
    const payload = await request<unknown>(`/api/analytics?${new URLSearchParams({ period })}`);
    if (isAnalyticsResponse(payload)) return payload;
    // Keep the new UI usable against an already-running backend during rollout.
    if (Array.isArray(payload) && payload.every(isAnalyticsRow)) {
      const hours_by_activity = payload.reduce<AnalyticsResponse["summary"]["hours_by_activity"]>((totals, row) => ({
        Gym: totals.Gym + row.Gym,
        Study: totals.Study + row.Study,
        Run: totals.Run + row.Run,
      }), { Gym: 0, Study: 0, Run: 0 });
      const total_hours = Number(Object.values(hours_by_activity).reduce((sum, hours) => sum + hours, 0).toFixed(1));
      return { series: payload, summary: { total_hours, previous_total_hours: 0, change_hours: 0, change_percent: null, hours_by_activity } };
    }
    throw new Error("The server returned an unexpected response for analytics.");
  },
  getFinance: () => requestObject("/api/finance", isFinanceSummary),
  setBalance: (amount: number) => postJson<SuccessResponse>("/api/finance/balance", { amount }),
  getFinanceBreakdown: () => requestArray("/api/finance/breakdown", isBreakdown),
  getTransactions: () => requestArray("/api/transactions", isTransaction),
  addTransaction: (amount: number, type: TransactionType, category: string, description = "") => postJson<SuccessResponse>("/api/finance/add", { amount, type, category, description }),
  deleteTransaction: (id: number) => requestObject(`/api/transactions/${id}`, isSuccess, { method: "DELETE" }),
  getRecentActivities: () => requestArray("/api/activities", isActivity),
  logActivity: (type: ActivityType, distance = 0, duration_minutes = 0, description = "") => postJson<SuccessResponse>("/api/activities/add", { type, distance, duration_minutes, description }),
  deleteActivity: (id: number) => requestObject(`/api/activities/${id}`, isSuccess, { method: "DELETE" }),
  getSleep: () => request<SleepLog | null>("/api/sleep"),
  logSleep: (hours: number, quality: number) => postJson<SuccessResponse>("/api/sleep", { hours, quality }),
  planTrip: (destination: string, budget = 100) => postJson<TripPlanResponse>("/api/plan_trip", { destination, budget }),
  getFiles: () => requestArray("/api/files", isFile),
  deleteFile: (id: number) => requestObject(`/api/files/${id}`, isSuccess, { method: "DELETE" }),
  uploadFiles: (files: FileList | File[]) => {
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);
    return requestObject("/api/upload", isUploadResponse, { method: "POST", body: formData });
  },
  generateFlashcards: () => requestObject("/api/flashcards", isFlashcardResponse, { method: "POST" }),
  getStandup: () => requestObject("/api/standup", isStandup, { method: "GET" }),
  getPrivacy: () => requestObject("/api/privacy", isPrivacySettings),
};

function isChatResponse(value: unknown): value is ChatResponse {
  return isRecord(value) && isText(value.reply) && isNumber(value.conversation_id) && (value.attachment_notice === undefined || isText(value.attachment_notice));
}
function isStandup(value: unknown): value is StandupResponse { return isRecord(value) && isText(value.standup); }
function isPrivacySettings(value: unknown): value is PrivacySettings { return isRecord(value) && typeof value.cloud_ai_fallback === "boolean" && (value.ai_mode === "local-only" || value.ai_mode === "cloud-fallback"); }
function isAuthSession(value: unknown): value is AuthSession { return isRecord(value) && typeof value.authenticated === "boolean"; }
function isFlashcardResponse(value: unknown): value is FlashcardResponse {
  return isRecord(value) && Array.isArray(value.flashcards) && value.flashcards.every((card) => isRecord(card) && isText(card.q) && isText(card.a)) && (value.source_note === undefined || isText(value.source_note));
}
function isCompletedTask(value: unknown): value is Pick<Task, "id" | "text" | "category" | "description" | "created_at" | "target_month"> {
  return isRecord(value) && isNumber(value.id) && isText(value.text) && isText(value.category) && isText(value.description) && isText(value.created_at) && (value.target_month === undefined || isText(value.target_month));
}

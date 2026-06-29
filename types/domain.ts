export type UserRole = "admin" | "management" | "tech_manager" | "worker" | "store_manager";
export type ObjectType = "store" | "warehouse" | "production" | "office" | "other";
export type TicketStatus = "pending_review" | "new" | "in_progress" | "waiting" | "done" | "cancelled" | "rejected";
export type TicketPriority = "low" | "medium" | "high" | "critical";
export type PhotoType = "before" | "progress" | "after";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  object_id?: string | null;
  default_object_id?: string | null;
  telegram_id?: string | null;
  telegram_username?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CompanyObject {
  id: string;
  name: string;
  type: ObjectType;
  object_number: string;
  city: string;
  district?: string | null;
  address: string;
  aliases?: string[] | null;
  manager_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Ticket {
  id: string;
  number: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  object_id: string;
  category_id: string;
  created_by: string;
  assigned_to?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  source?: string | null;
  telegram_chat_id?: string | null;
  telegram_message_id?: string | null;
  telegram_source_group_id?: string | null;
  telegram_user_id?: string | null;
  telegram_user_name?: string | null;
  original_message_text?: string | null;
  ai_confidence?: number | null;
  ai_raw_result?: Record<string, unknown> | null;
  recommended_department?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface TicketPhoto {
  id: string;
  ticket_id: string;
  uploaded_by: string;
  type: PhotoType;
  storage_path: string;
  caption?: string | null;
  created_at: string;
}

export interface TicketPhotoWithUrl extends TicketPhoto {
  url?: string | null;
}

export interface AuditLog {
  id: string;
  ticket_id?: string | null;
  actor_id?: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TicketWithRelations extends Ticket {
  object?: CompanyObject | null;
  category?: Category | null;
  creator?: Profile | null;
  assignee?: Profile | null;
}

export interface TicketCommentWithAuthor extends TicketComment {
  author?: Profile | null;
}

export interface TicketHistory {
  id: string;
  ticket_id: string;
  actor_id?: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Profile | null;
}

export interface TelegramSession {
  id: string;
  telegram_id: string;
  step: string;
  payload: Record<string, unknown>;
  updated_at: string;
}

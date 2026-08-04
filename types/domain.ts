export type UserRole = "admin" | "management" | "tech_manager" | "worker" | "store_manager" | "store_director";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ObjectType = "store" | "warehouse" | "production" | "office" | "other";
export type TicketStatus =
  | "pending_review"
  | "new"
  | "assigned"
  | "in_progress"
  | "waiting"
  | "waiting_admin_confirmation"
  | "done"
  | "cancelled"
  | "rejected";
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
  approval_status?: ApprovalStatus;
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
  source?: string | null;
  created_by_profile_id?: string | null;
  needs_admin_review?: boolean;
  admin_note?: string | null;
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

export interface Worker {
  id: string;
  name: string;
  phone?: string | null;
  telegram_username?: string | null;
  telegram_id?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface WorkerCategory {
  id: string;
  worker_id: string;
  category_id: string;
  created_at: string;
}

export interface WorkerWithCategories extends Worker {
  worker_categories?: Array<WorkerCategory & { category?: Category | null }> | null;
  categories?: Category[];
}

export interface WorkerStats {
  worker: Worker;
  total: number;
  active: number;
  done: number;
  waitingConfirmation: number;
  averageRating: number | null;
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
  assignee_worker_id?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  assigned_at?: string | null;
  sent_to_worker_at?: string | null;
  worker_completed_at?: string | null;
  admin_confirmed_at?: string | null;
  admin_rating?: number | null;
  admin_feedback?: string | null;
  source?: string | null;
  created_by_profile_id?: string | null;
  director_profile_id?: string | null;
  director_phone?: string | null;
  confirmed_by_profile_id?: string | null;
  telegram_chat_id?: string | null;
  telegram_message_id?: string | null;
  telegram_source_group_id?: string | null;
  telegram_user_id?: string | null;
  telegram_user_name?: string | null;
  original_message_text?: string | null;
  ai_confidence?: number | null;
  ai_raw_result?: Record<string, unknown> | null;
  recommended_department?: string | null;
  repeat_count?: number;
  last_repeat_at?: string | null;
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
  worker?: Worker | null;
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

export interface WorkCompletionAct {
  id: string;
  ticket_id: string;
  object_id: string;
  director_profile_id: string;
  worker_id?: string | null;
  act_number: string;
  work_description: string;
  director_comment?: string | null;
  completed_at: string;
  confirmed_at: string;
  created_at: string;
  updated_at: string;
  created_by_profile_id?: string | null;
}

export interface WorkCompletionActPhoto {
  id: string;
  act_id: string;
  ticket_id: string;
  storage_path: string;
  file_name?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
  uploaded_by_profile_id?: string | null;
}

export interface WorkCompletionActWithRelations extends WorkCompletionAct {
  ticket?: TicketWithRelations | null;
  object?: CompanyObject | null;
  director?: Profile | null;
  worker?: Worker | null;
  photos?: WorkCompletionActPhoto[];
}

export interface TelegramSession {
  id: string;
  telegram_id: string;
  step: string;
  payload: Record<string, unknown>;
  updated_at: string;
}

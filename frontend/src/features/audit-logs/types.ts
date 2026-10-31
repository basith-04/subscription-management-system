export interface AuditLog { id: number; actor: { id: number; name: string } | null; action: string; entity_type: string; entity_id: number; old_values: unknown | null; new_values: unknown | null; ip_address: string | null; created_at: string }
export interface AuditLogFilters { entity_type?: string; entity_id?: string; actor_user_id?: string; action?: string; date_from?: string; date_to?: string; page?: string; page_size?: string }
export interface AuditLogList { data: AuditLog[]; meta: { page: number; page_size: number; total: number; total_pages: number } }

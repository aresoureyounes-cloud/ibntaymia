export type DataTable = {
  name: string;
  label: string;
  key: string;
  searchColumns: string[];
  orderBy?: string;
  readOnly?: boolean;
  noDelete?: boolean;
};

// Tables the data browser may touch. Roles, secrets and login codes are deliberately excluded.
export const DATA_TABLES: DataTable[] = [
  { name: "students", label: "التلاميذ", key: "id", searchColumns: ["full_name", "national_student_id", "guardian_name", "guardian_phone", "father_phone", "mother_phone"], orderBy: "created_at", noDelete: true },
  { name: "classes", label: "الأقسام", key: "id", searchColumns: ["name", "level", "branch"], orderBy: "created_at" },
  { name: "staff_whitelist", label: "الأساتذة والعمال", key: "id", searchColumns: ["full_name", "email"], orderBy: "created_at" },
  { name: "profiles", label: "ملفات الحسابات", key: "id", searchColumns: ["full_name", "phone"], orderBy: "created_at", noDelete: true },
  { name: "schedule_slots", label: "البرنامج الأسبوعي", key: "id", searchColumns: ["subject", "room", "group_label"], orderBy: "created_at" },
  { name: "class_teachers", label: "إسناد الأساتذة", key: "id", searchColumns: ["subject"], orderBy: "created_at" },
  { name: "attendance_sessions", label: "حصص الحضور", key: "id", searchColumns: ["subject", "period", "note"], orderBy: "created_at" },
  { name: "attendance_records", label: "سجلات الحضور", key: "id", searchColumns: ["status", "note"], orderBy: "created_at" },
  { name: "entry_permits", label: "تصاريح الدخول", key: "id", searchColumns: ["reason", "kind"], orderBy: "created_at", readOnly: true },
  { name: "legal_notices", label: "الإشعارات القانونية", key: "id", searchColumns: ["note", "delivery_method"], orderBy: "issued_at", readOnly: true },
  { name: "teacher_absences", label: "غيابات الأساتذة", key: "id", searchColumns: ["reason"], orderBy: "created_at" },
  { name: "homework", label: "الواجبات", key: "id", searchColumns: ["title", "subject"], orderBy: "created_at" },
  { name: "school_events", label: "التقويم", key: "id", searchColumns: ["title", "description"], orderBy: "created_at" },
  { name: "notifications", label: "الإشعارات", key: "id", searchColumns: ["title", "body"], orderBy: "created_at" },
  { name: "behavior_records", label: "السلوك", key: "id", searchColumns: ["title", "note"], orderBy: "created_at" },
  { name: "parent_student", label: "ربط الأولياء", key: "id", searchColumns: ["relation"], orderBy: "created_at" },
  { name: "profile_audit_log", label: "سجل الدخول والعمليات", key: "id", searchColumns: ["action", "ip", "user_agent"], orderBy: "created_at", readOnly: true },
];

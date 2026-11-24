export type Role = "owner" | "admin" | "marketing" | "staff";

export const ROLES: Role[] = ["owner", "admin", "marketing", "staff"];

/** Specchio della matrice in docs/ARCHITECTURE.md. L'autorità reale è la RLS del database. */
const rules = {
  "contacts.archive": ["owner", "admin"],
  "contacts.merge": ["owner", "admin"],
  "contacts.export": ["owner", "admin"],
  "contacts.import": ["owner", "admin"],
  "consents.record": ["owner", "admin", "marketing"],
  "users.manage": ["owner"],
  "settings.view": ["owner", "admin"],
  "finance.view": ["owner", "admin"],
  "analytics.view": ["owner", "admin", "marketing"],
  "payments.record": ["owner", "admin"],
  "bookings.manage": ["owner", "admin", "staff"],
  "config.manage": ["owner", "admin"],
  "marketing.spend": ["owner", "admin", "marketing"],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof rules;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (rules[permission] as readonly Role[]).includes(role);
}

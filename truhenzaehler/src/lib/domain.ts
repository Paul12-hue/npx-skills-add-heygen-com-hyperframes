// Zentrale Wertelisten + deutsche Beschriftungen.
export const ROLES = ["ADMIN", "OFFIZIER", "MITGLIED"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin / Clan-Leitung",
  OFFIZIER: "Offizier",
  MITGLIED: "Mitglied",
};
const ROLE_RANK: Record<Role, number> = { MITGLIED: 1, OFFIZIER: 2, ADMIN: 3 };
export const hasRole = (actual: string | undefined, min: Role) =>
  !!actual && (ROLE_RANK[actual as Role] ?? 0) >= ROLE_RANK[min];

export const SOURCES = ["KRYPTA", "EVENT", "AUFGABE", "KAMPF", "ZITADELLE", "ARENA", "SONSTIGE"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  KRYPTA: "Krypta",
  EVENT: "Event",
  AUFGABE: "Aufgabe",
  KAMPF: "Kampf / Monster",
  ZITADELLE: "Zitadelle",
  ARENA: "Arena",
  SONSTIGE: "Sonstige",
};

export const ORIGINS = ["MANUELL", "CSV", "OCR", "API"] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<Origin, string> = {
  MANUELL: "Manuell",
  CSV: "CSV-Import",
  OCR: "Screenshot/OCR",
  API: "Automatisch (API)",
};

export const CHEST_STATUS = ["GUELTIG", "PRUEFEN", "VERWORFEN"] as const;
export type ChestStatus = (typeof CHEST_STATUS)[number];
export const CHEST_STATUS_LABEL: Record<ChestStatus, string> = {
  GUELTIG: "Gültig",
  PRUEFEN: "Prüfen (mögl. Duplikat)",
  VERWORFEN: "Verworfen",
};

export const MEMBER_STATUS = ["AKTIV", "PAUSIERT", "AUSGETRETEN"] as const;
export type MemberStatus = (typeof MEMBER_STATUS)[number];
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  AKTIV: "Aktiv",
  PAUSIERT: "Pausiert (Urlaub)",
  AUSGETRETEN: "Ausgetreten",
};

export const CHEST_CATEGORIES = ["STANDARD", "EVENT", "SELTEN"] as const;
export const CATEGORY_LABEL: Record<string, string> = {
  STANDARD: "Standard",
  EVENT: "Event",
  SELTEN: "Selten",
};

export const GOAL_METRICS = ["PUNKTE", "TRUHEN"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const METRIC_LABEL: Record<GoalMetric, string> = { PUNKTE: "Punkte", TRUHEN: "Truhen" };

/** Zeitfenster (Minuten), in dem gleichartige Truhen als mögliches Duplikat markiert werden. */
export const DUPLICATE_WINDOW_MIN = 2;

/**
 * Advisory password feedback for the UI. The server only enforces 10–128
 * characters; this adds guidance (it never blocks anything the server accepts).
 */
export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordAssessment {
  /** 0 = empty, 1 = too short / weak … 4 = strong */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: { length: boolean; variety: boolean; notObvious: boolean };
}

const OBVIOUS = [
  "password",
  "passw0rd",
  "123456",
  "12345678",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "iloveyou",
  "abc123",
  "monkey",
  "dragon",
];

const LABELS = ["", "Too weak", "Fair", "Good", "Strong"] as const;

const classesOf = (pw: string) =>
  [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;

/** `personal` = strings that must not appear in the password (name, email local part…). */
export const assessPassword = (
  pw: string,
  personal: string[] = [],
): PasswordAssessment => {
  const lower = pw.toLowerCase();
  const personalHit = personal
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length >= 3)
    .some((p) => lower.includes(p));
  const obvious =
    OBVIOUS.some((w) => lower.includes(w)) ||
    /(.)\1{3,}/.test(pw) ||
    personalHit;
  const lengthOk = pw.length >= MIN_PASSWORD_LENGTH;
  const variety = classesOf(pw) >= 3 || pw.length >= 16;
  const checks = { length: lengthOk, variety, notObvious: !obvious };

  if (pw.length === 0) {
    return { score: 0, label: "", checks };
  }
  if (!lengthOk) {
    return { score: 1, label: "Too short", checks };
  }
  let score = 1;
  if (pw.length >= 12) {
    score += 1;
  }
  if (variety) {
    score += 1;
  }
  if (pw.length >= 16) {
    score += 1;
  }
  if (obvious) {
    score = Math.min(score, 1);
  }
  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  return { score: clamped, label: LABELS[clamped], checks };
};

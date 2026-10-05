/**
 * Error types shared by server modules. Route handlers map them to the
 * consistent JSON shape `{ error: <Arabic, user-facing>, code: <stable id> }`
 * in src/server/http.ts. Codes are part of the API contract — clients switch
 * on `code`, never on the Arabic message.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** Arabic, safe to show to the user. */
    public userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(`${code}: ${userMessage}`, options);
    this.name = "ApiError";
  }
}

/** The verified Quran source (API, DB or JSON cache) could not be reached. */
export class QuranSourceUnavailableError extends Error {
  readonly code = "quran_source_unavailable";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "QuranSourceUnavailableError";
  }
}

/** Text came back but failed integrity checks — it is never served. */
export class QuranVerificationError extends Error {
  readonly code = "quran_verification_failed";
  constructor(
    message: string,
    public problems: string[] = [],
  ) {
    super(message);
    this.name = "QuranVerificationError";
  }
}

export class DatabaseNotConfiguredError extends Error {
  readonly code = "no_database";
  constructor() {
    super("DATABASE_URL is not set — this feature needs PostgreSQL (see .env.example).");
    this.name = "DatabaseNotConfiguredError";
  }
}

/** Upstream AI/STT vendor failure (network, 5xx, bad key). */
export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
    options?: { cause?: unknown },
  ) {
    super(`[${provider}] ${message}`, options);
    this.name = "ProviderError";
  }
}

/** Arabic messages for the stable error codes. */
export const MESSAGES = {
  invalid_request: "الطلب غير صالح. تحقّق من البيانات المرسلة.",
  unauthorized: "يلزم تسجيل الدخول للمتابعة.",
  forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  not_found: "العنصر المطلوب غير موجود.",
  rate_limited: "طلبات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مجددًا.",
  payload_too_large: "حجم التسجيل أكبر من المسموح (١٥ ميغابايت). سجّل مقطعًا أقصر.",
  unsupported_media_type: "صيغة الملف الصوتي غير مدعومة.",
  quran_source_unavailable: "تعذّر الوصول إلى مصدر نص المصحف الموثّق الآن. حاول مرة أخرى بعد قليل.",
  quran_verification_failed: "لم يجتز نص المصحف المستلم التحقّق من السلامة، لذلك لم يُعرض. حاول لاحقًا.",
  no_database: "الحسابات السحابية غير مفعّلة على هذا الخادم. ستُحفظ بياناتك على هذا الجهاز.",
  stt_unavailable: "خدمة تحويل الصوت إلى نص غير متاحة الآن. جرّب التعرّف من المتصفح أو حاول لاحقًا.",
  email_taken: "هذا البريد مسجّل مسبقًا. جرّب تسجيل الدخول.",
  invalid_credentials: "البريد أو كلمة المرور غير صحيحة.",
  range_too_large: "النطاق المطلوب كبير. اختر ٣٠ آية أو أقل.",
  push_not_configured: "الإشعارات الفورية غير مفعّلة على هذا الخادم.",
  internal: "حدث خطأ غير متوقّع. حاول مرة أخرى.",
} as const;

export type ErrorCode = keyof typeof MESSAGES;

export function apiError(status: number, code: ErrorCode, message?: string): ApiError {
  return new ApiError(status, code, message ?? MESSAGES[code]);
}

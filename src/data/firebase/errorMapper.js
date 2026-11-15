/**
 * Standardized application error categories required across all portals and repositories.
 */
export const ERROR_CATEGORY = Object.freeze({
  PERMISSION_DENIED: 'permission-denied',
  UNAVAILABLE: 'unavailable',
  CONFLICT: 'conflict',
  VALIDATION: 'validation',
  NOT_FOUND: 'not-found',
  QUOTA_EXHAUSTED: 'resource-exhausted',
  UNAUTHENTICATED: 'unauthenticated',
  CONFIG: 'configuration',
  UNKNOWN: 'unknown',
});

export class AppError extends Error {
  /**
   * @param {{
   *   category: string,
   *   message: string,
   *   code?: string,
   *   retryable?: boolean,
   *   cause?: unknown,
   * }} options
   */
  constructor({ category, message, code = '', retryable = false, cause = null }) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

const FIRESTORE_CATEGORY_MAP = Object.freeze({
  'permission-denied': {
    category: ERROR_CATEGORY.PERMISSION_DENIED,
    message: 'Akses ditolak oleh aturan keamanan sistem. Periksa role atau status keanggotaan Anda.',
    retryable: false,
  },
  unavailable: {
    category: ERROR_CATEGORY.UNAVAILABLE,
    message: 'Layanan Firestore sedang tidak terjangkau atau koneksi terputus. Periksa internet Anda lalu coba lagi.',
    retryable: true,
  },
  'deadline-exceeded': {
    category: ERROR_CATEGORY.UNAVAILABLE,
    message: 'Permintaan ke database melewati batas waktu. Silakan coba lagi.',
    retryable: true,
  },
  aborted: {
    category: ERROR_CATEGORY.CONFLICT,
    message: 'Terjadi bentrok transaksi bersamaan. Sistem menyegarkan data terbaru—silakan ulangi aksi.',
    retryable: true,
  },
  'already-exists': {
    category: ERROR_CATEGORY.CONFLICT,
    message: 'Data dengan ID tersebut sudah ada atau slot sudah terisi.',
    retryable: false,
  },
  'failed-precondition': {
    category: ERROR_CATEGORY.CONFLICT,
    message: 'Operasi ditolak karena kondisi prasyarat data atau index belum terpenuhi.',
    retryable: false,
  },
  'invalid-argument': {
    category: ERROR_CATEGORY.VALIDATION,
    message: 'Input atau struktur data tidak memenuhi ketentuan validasi.',
    retryable: false,
  },
  'not-found': {
    category: ERROR_CATEGORY.NOT_FOUND,
    message: 'Data atau dokumen yang diminta tidak ditemukan.',
    retryable: false,
  },
  'resource-exhausted': {
    category: ERROR_CATEGORY.QUOTA_EXHAUSTED,
    message: 'Batas kuota atau laju permintaan Firestore telah tercapai. Tunggu sebentar sebelum mencoba lagi.',
    retryable: true,
  },
  unauthenticated: {
    category: ERROR_CATEGORY.UNAUTHENTICATED,
    message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.',
    retryable: false,
  },
});

const AUTH_CODE_MESSAGES = Object.freeze({
  'auth/invalid-credential': 'Email atau kata sandi tidak cocok.',
  'auth/user-not-found': 'Akun tidak ditemukan.',
  'auth/wrong-password': 'Email atau kata sandi tidak cocok.',
  'auth/email-already-in-use': 'Email ini sudah terdaftar pada Firebase Auth.',
  'auth/weak-password': 'Kata sandi terlalu lemah (minimal 6 karakter).',
  'auth/invalid-email': 'Format email tidak valid.',
  'auth/user-disabled': 'Akun ini sedang dinonaktifkan.',
  'auth/too-many-requests': 'Terlalu banyak percobaan login. Tunggu beberapa saat sebelum mencoba lagi.',
  'auth/network-request-failed': 'Koneksi jaringan gagal saat menghubungi layanan autentikasi.',
});

/**
 * Maps any Firebase SDK, Domain validation, or runtime error into a predictable AppError.
 * @param {unknown} error
 * @returns {AppError}
 */
export function mapFirebaseError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error && typeof error === 'object' && error.name === 'DomainValidationError') {
    return new AppError({
      category: ERROR_CATEGORY.VALIDATION,
      code: 'validation/schema',
      message: error.message || 'Skema dokumen tidak valid.',
      retryable: false,
      cause: error,
    });
  }

  const rawCode = typeof error?.code === 'string' ? error.code : '';
  const normalizedFirestoreCode = rawCode.replace(/^firestore\//, '');

  if (rawCode.startsWith('auth/')) {
    const isNetwork = rawCode === 'auth/network-request-failed';
    const isQuota = rawCode === 'auth/too-many-requests';
    return new AppError({
      category: isNetwork
        ? ERROR_CATEGORY.UNAVAILABLE
        : isQuota
          ? ERROR_CATEGORY.QUOTA_EXHAUSTED
          : ERROR_CATEGORY.UNAUTHENTICATED,
      code: rawCode,
      message: AUTH_CODE_MESSAGES[rawCode] || 'Proses autentikasi gagal. Silakan periksa kredensial Anda.',
      retryable: isNetwork || isQuota,
      cause: error,
    });
  }

  const mapped = FIRESTORE_CATEGORY_MAP[normalizedFirestoreCode];
  if (mapped) {
    return new AppError({
      category: mapped.category,
      code: rawCode || normalizedFirestoreCode,
      message: mapped.message,
      retryable: mapped.retryable,
      cause: error,
    });
  }

  return new AppError({
    category: ERROR_CATEGORY.UNKNOWN,
    code: rawCode || 'unknown',
    message:
      typeof error?.message === 'string' && error.message.length > 0
        ? error.message
        : 'Terjadi kesalahan sistem yang tidak terduga.',
    retryable: false,
    cause: error,
  });
}

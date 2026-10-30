import type { MessageKey } from './en'

// Hindi. Wording should be reviewed by a native speaker before it is switched on for patients.
export const hi: Record<MessageKey, string> = {
  'error.SERVER_ERROR': 'कुछ गलत हो गया। कृपया दोबारा प्रयास करें।',
  'error.CLINIC_NOT_FOUND': 'क्लिनिक नहीं मिला',
  'error.UNAUTHORIZED': 'जारी रखने के लिए कृपया साइन इन करें',
  'error.FORBIDDEN': 'आपको ऐसा करने की अनुमति नहीं है',
  'error.NOT_FOUND': 'नहीं मिला',
  'error.RATE_LIMITED': 'बहुत अधिक अनुरोध। कृपया बाद में दोबारा प्रयास करें।',
  'error.VALIDATION': 'कृपया विवरण जाँचें और दोबारा प्रयास करें',
  'error.NETWORK': 'सर्वर तक नहीं पहुँच सके। अपना कनेक्शन जाँचें और दोबारा प्रयास करें।',

  'common.home': 'होम',
  'common.backToHome': 'होम पर वापस जाएँ',
  'common.cancel': 'रद्द करें',
  'common.confirm': 'पुष्टि करें',
  'common.loading': 'लोड हो रहा है',
  'common.close': 'बंद करें',
  'common.skipToContent': 'मुख्य सामग्री पर जाएँ',
  'common.fileTooLarge': 'यह फ़ाइल बहुत बड़ी है',
}

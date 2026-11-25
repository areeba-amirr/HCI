// Hand-written Urdu for MediSnap (part 5): language choice, read aloud, voice input.
// NOT clinically reviewed: see ./index.ts.
import type { Messages } from "../messages";

export const ur5: Partial<Messages> = {
  "language.chooseTitle": "اپنی زبان منتخب کریں",
  "language.chooseBody": "آپ اسے کبھی بھی ترتیبات میں بدل سکتے ہیں۔",
  "language.more": "مزید زبانیں",
  "language.moreShort": "مزید",
  "language.machine": "یہ زبانیں مشینی ترجمہ ہیں اور جانچی نہیں گئیں۔",
  "language.machineShort": "مشینی ترجمہ",
  "medical.original": "اصل (انگریزی):",
  "voice.listen": "سنیں",
  "voice.pause": "روکیں",
  "voice.resume": "جاری رکھیں",
  "voice.stop": "بند کریں",
  "voice.guidance": "طریقہ سنیں",
  "voice.cameraSteps": "جب تصویر صاف نظر آئے تو \"تصویر لیں\" دبائیں۔ پھر تصویر دیکھ کر \"یہ تصویر استعمال کریں\" دبائیں، یا دوبارہ کوشش کے لیے \"دوبارہ لیں\" دبائیں۔",
  "voice.unsupported": "یہ براؤزر متن پڑھ کر نہیں سنا سکتا۔ تازہ Chrome یا Edge آزمائیں۔",
  "voice.noUrduVoice": "اس آلے میں اردو آواز موجود نہیں، اس لیے یہ اردو میں پڑھ کر نہیں سنایا جا سکتا۔ آپ اپنے فون یا کمپیوٹر کی آواز (Speech) کی ترتیبات میں اردو آواز شامل کر سکتے ہیں۔",
  "voice.noVoice": "اس آلے میں اس زبان کی آواز موجود نہیں۔",
  "diary.speakIn": "کس زبان میں بولیں گے:",
  "rpt.hoursUnit": "گھنٹے",
  "rpt.pdfLanguage": "رپورٹ کی زبان",
  "rpt.pdfLanguageHint": "وہ زبان منتخب کریں جو آپ کا ڈاکٹر پڑھتا ہے۔ دواؤں کے نام اور آپ کے اپنے نوٹس بالکل ویسے ہی رہیں گے جیسے آپ نے لکھے۔",
  "rpt.pdfUrduReview": "اردو رپورٹ کے الفاظ ابھی کسی طبی ماہر نے نہیں جانچے۔",
};

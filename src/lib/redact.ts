// 送給 AI 之前拿掉個人聯絡資料：評估職缺不需要知道你的姓名、電話、地址。
// 只處理「送出去的那一份」，存在本機的個人檔案不會被改動。

const RULES: [RegExp, string][] = [
  // Email
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[Email]'],
  // 身分證字號、居留證號
  [/\b[A-Z][1289]\d{8}\b/g, '[身分證字號]'],
  // 手機：0912-345-678、0912 345 678、+886 912 345 678
  [/(?:\+?886[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{3}/g, '[電話]'],
  // 市話：(02)2345-6789、02-2345-6789、04 2345 6789
  [/\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{4}\b/g, '[電話]'],
  // LinkedIn、GitHub 等個人網址（保留網域，拿掉帳號）
  [/\b(linkedin\.com\/in|github\.com|facebook\.com|instagram\.com)\/[\w.-]+/gi, '$1/[帳號]'],
];

// 整行都是個資的欄位：「姓名：王小明」「地址：…」「生日：…」
const LINE_FIELDS = /^(\s*[-•・]?\s*)(姓\s*名|中文姓名|英文姓名|Name|地\s*址|通訊地址|戶籍地址|住\s*址|Address|生\s*日|出生日期|出生年月日|Birthday|Date of Birth|身分證字號|聯絡電話|手\s*機|電\s*話|Phone|Mobile|E-?mail|LINE\s*ID)\s*[:：]\s*.+$/gim;

export function redact(text: string | undefined, name?: string): string {
  if (!text) return '';
  let out = text.replace(LINE_FIELDS, (_m, pre: string, field: string) => `${pre}${field.replace(/\s+/g, '')}：[已移除]`);
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  // 使用者自己填的姓名：全文都換掉
  const n = (name || '').trim();
  if (n.length >= 2) out = out.split(n).join('[姓名]');
  return out;
}

/** 從履歷第一行或「姓名：」欄位猜使用者的名字，只用來在送出前遮掉 */
export function guessName(resume: string | undefined): string | undefined {
  if (!resume) return;
  const field = resume.match(/(?:姓\s*名|中文姓名)\s*[:：]\s*([一-鿿]{2,4})/);
  if (field) return field[1];
  const first = resume.trim().split('\n')[0]?.trim() ?? '';
  return /^[一-鿿]{2,4}$/.test(first) ? first : undefined;
}

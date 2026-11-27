// 從 PDF、Word、純文字檔讀出履歷文字。全部在瀏覽器裡處理，檔案不會上傳。
// PDF 解析器很大，只在使用者真的上傳 PDF 時才載入。

export const RESUME_ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export class ResumeFileError extends Error {}

export async function readResumeFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.size > 15 * 1024 * 1024) throw new ResumeFileError('檔案超過 15 MB，請改貼上文字');
  let text: string;
  if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await readPdf(file);
  else if (name.endsWith('.docx')) text = await readDocx(await file.arrayBuffer());
  else if (name.endsWith('.doc')) throw new ResumeFileError('不支援舊版 .doc，請在 Word 另存成 .docx 或 PDF');
  else text = await file.text();
  text = tidy(text);
  if (text.length < 30) {
    throw new ResumeFileError(name.endsWith('.pdf') ? '這個 PDF 讀不到文字，可能是掃描的圖片。請改貼上文字。' : '檔案裡讀不到文字');
  }
  return text;
}

export function tidy(s: string): string {
  return s
    // 有些 PDF 的中文字型會把「大」「工」存成外觀相同的部首字元（U+2F00–2FDF、U+2E80–2EFF），轉回一般漢字
    .replace(/[\u2e80-\u2eff\u2f00-\u2fdf]/g, (c) => c.normalize('NFKC'))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** .docx 是 zip，內文在 word/document.xml；段落 <w:p>、換行 <w:br>、tab <w:tab> */
export async function readDocx(buf: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === 'word/document.xml' });
  } catch {
    throw new ResumeFileError('這個 Word 檔打不開，可能已損毀或有密碼保護');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new ResumeFileError('這不是有效的 Word（.docx）檔案');
  return docxXmlToText(strFromU8(xml));
}

export function docxXmlToText(xml: string): string {
  const decode = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml
    .replace(/>\s+<(?!\/w:t>)/g, '><') // 標籤之間的排版空白不是內容（只有空白的 <w:t> 要保留）
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tc>/g, '\t') // 表格儲存格
    .split(/<w:t(?:\s[^>]*)?>/)
    .map((chunk, i) => {
      if (i === 0) return chunk.replace(/<[^>]+>/g, '');
      const end = chunk.indexOf('</w:t>');
      return end < 0 ? chunk.replace(/<[^>]+>/g, '') : decode(chunk.slice(0, end)) + chunk.slice(end).replace(/<[^>]+>/g, '');
    })
    .join('');
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: chrome.runtime.getURL('/pdfjs/cmaps/'),
    cMapPacked: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if ((e as Error).name === 'PasswordException') throw new ResumeFileError('這個 PDF 有密碼保護，請先移除密碼');
    throw new ResumeFileError('這個 PDF 打不開');
  }
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // 依照 y 座標分行：同一行的文字片段接在一起
    let lastY: number | null = null;
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
        lastY = null;
        continue;
      }
      lastY = y;
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
  }
  await task.destroy();
  return pages.join('\n\n');
}

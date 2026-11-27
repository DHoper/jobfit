import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { docxXmlToText, readDocx, tidy } from '../src/lib/resume-file';

const XML = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>王小明</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">後端工程師 </w:t></w:r><w:r><w:t>｜</w:t></w:r><w:r><w:tab/><w:t>2021–至今</w:t></w:r></w:p>
<w:p><w:r><w:t>負責 API &amp; 資料庫</w:t><w:br/><w:t>帶 2 人小組</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Go</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>5 年</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

describe('docx', () => {
  it('段落、換行、tab、跳脫字元', () => {
    const t = tidy(docxXmlToText(XML));
    expect(t).toContain('王小明\n後端工程師 ｜ 2021–至今');
    expect(t).toContain('負責 API & 資料庫\n帶 2 人小組');
    expect(t).toContain('Go');
  });
  it('只有空白的文字片段要保留（英文單字之間）', () => {
    expect(docxXmlToText('<w:p><w:r><w:t>Senior</w:t></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>Engineer</w:t></w:r></w:p>')).toBe('Senior Engineer\n');
  });
  it('從 zip 讀出 word/document.xml', async () => {
    const zip = zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'word/document.xml': strToU8(XML) });
    const t = await readDocx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer);
    expect(t).toContain('王小明');
  });
  it('不是 docx 會給清楚的錯誤', async () => {
    await expect(readDocx(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(/打不開|不是有效/);
  });
});

describe('tidy', () => {
  it('部首字元轉回一般漢字，全形標點不變', () => {
    expect(tidy('陳⼤⽂，後端⼯程師：Go')).toBe('陳大文，後端工程師：Go');
  });
});

import { readResumeFile } from '../src/lib/resume-file';
describe('readResumeFile', () => {
  it('讀出大量空字元時給清楚的錯誤', async () => {
    const f = new File(['\u0000'.repeat(60) + ' API 3,000 QPS'], 'x.txt', { type: 'text/plain' });
    await expect(readResumeFile(f)).rejects.toThrow(/讀不出來/);
  });
  it('純文字檔', async () => {
    const f = new File(['王小明\n後端工程師，負責訂單系統 API，尖峰 3,000 QPS，帶 2 人小組。'], 'x.txt', { type: 'text/plain' });
    await expect(readResumeFile(f)).resolves.toContain('後端工程師');
  });
});

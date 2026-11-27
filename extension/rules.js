// 台灣職缺常見的「地雷字眼」：規則式偵測，不用 AI、當下就有結果，也會一併交給 AI 參考。
// level：high = 很可能有問題；medium = 值得問清楚；low = 提醒注意
// key 也用在設定頁的「底線」勾選：使用者勾了的項目，命中時會直接列為不能接受。
(() => {
  if (globalThis.JOBFIT_RULES) return;
  globalThis.JOBFIT_RULES = [
    { key: 'salary_hidden', label: '薪資面議', level: 'medium', re: /待遇面議|薪資面議|薪水面議/, why: '沒寫薪資範圍，面試前很難判斷值不值得去，也常是薪資偏低的訊號。' },
    { key: 'responsibility', label: '責任制', level: 'high', re: /責任制/, why: '常代表沒有加班費、工時不固定。' },
    { key: 'overtime', label: '需配合加班', level: 'high', re: /配合加班|能加班|需加班|可加班|加班配合/, why: '加班已經寫進條件裡，工時很可能偏長。' },
    { key: 'pressure', label: '抗壓性高', level: 'medium', re: /抗壓性?(高|佳|強)|能承受壓力|高壓/, why: '通常代表工作量大、壓力大，或主管風格強勢。' },
    { key: 'probation_pay', label: '試用期薪資打折', level: 'medium', re: /試用期.{0,12}(薪|月薪|打折|\d+%|折)/, why: '試用期薪水比正式低，要問清楚多久、差多少。' },
    { key: 'commission', label: '底薪加獎金', level: 'medium', re: /底薪.{0,10}(獎金|業績|抽成)|無責任底薪|業績獎金/, why: '收入有一大部分看業績，實際拿到的可能遠低於寫的數字。' },
    { key: 'shift', label: '輪班或假日上班', level: 'low', re: /輪班|大夜|小夜|排班|假日(需)?上班|週末上班/, why: '作息不固定，或休假和一般人錯開。' },
    { key: 'travel', label: '需出差或外派', level: 'low', re: /出差|外派|派駐/, why: '可能需要長時間在外地。' },
    { key: 'multitask', label: '一人多工', level: 'medium', re: /其他(主管)?交辦事項|一人多工|身兼|兼任/, why: '「交辦事項」範圍不明，工作內容可能會一直擴大。' },
    { key: 'grow_together', label: '與公司一起成長', level: 'low', re: /(與|跟)公司(一起|一同)成長|一起打拼|家人般/, why: '有時代表制度還不完整，或用情感取代實際的福利。' },
    { key: 'unpaid_test', label: '需完成作業或試做', level: 'low', re: /(面試|錄取前).{0,8}(作業|試做|實作)|需完成.{0,6}作業/, why: '可以接受，但作業量太大或沒有回饋時要小心。' },
    { key: 'dispatch', label: '派遣或約聘', level: 'medium', re: /派遣|約聘|承攬|外包人員/, why: '雇主可能不是你面試的那家公司，福利與穩定度要另外確認。' },
  ];

  globalThis.jobfitCheckRules = (text) => {
    const hits = [];
    for (const r of globalThis.JOBFIT_RULES) {
      const m = text.match(r.re);
      if (!m) continue;
      const i = m.index;
      const quote = text.slice(Math.max(0, i - 20), i + m[0].length + 20).replace(/\s+/g, ' ').trim();
      hits.push({ key: r.key, label: r.label, level: r.level, why: r.why, quote });
    }
    return hits;
  };
})();

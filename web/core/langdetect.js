export function detectLang(text, htmlLangHint = '') {
  const letters = text.match(/\p{L}/gu) || [];
  const ratio = re => letters.filter(ch => re.test(ch)).length / letters.length;
  if (ratio(/[\p{Script=Hiragana}\p{Script=Katakana}]/u) >= .03) return 'ja';
  if (ratio(/\p{Script=Hangul}/u) >= .2) return 'ko';
  if (ratio(/\p{Script=Han}/u) >= .2) return 'zh';
  if (ratio(/\p{Script=Latin}/u) > .5) return 'en';
  return /^(ja|zh|ko|en)/i.exec(htmlLangHint)?.[1].toLowerCase() || 'en';
}

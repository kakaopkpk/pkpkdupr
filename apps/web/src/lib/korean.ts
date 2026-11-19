const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
/** 한글 음절 하나가 차지하는 종성 경우의 수(받침 없음 포함) */
const FINAL_CONSONANT_COUNT = 28;

/**
 * 목적격 조사 "을"/"를". 끝 글자가 받침 있는 한글 음절이면 "을", 그 밖(받침 없음·한글이 아닌 글자·빈 문자열)은 "를"
 */
export const getObjectParticle = (word: string): "을" | "를" => {
  const last = Array.from(word.trim()).at(-1);
  const code = last?.codePointAt(0);
  if (
    code === undefined ||
    code < HANGUL_SYLLABLE_START ||
    code > HANGUL_SYLLABLE_END
  ) {
    return "를";
  }
  return (code - HANGUL_SYLLABLE_START) % FINAL_CONSONANT_COUNT === 0
    ? "를"
    : "을";
};

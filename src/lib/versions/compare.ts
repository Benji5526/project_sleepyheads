// WU-202 재현성 확인: 두 결과의 숫자가 모두 같은가 (Q6 `sameNumbers`).
import type { ResultObject } from "@/contracts";

/** 숫자 ID·값·표시·빈칸 사유가 하나도 빠짐없이 같으면 true */
export function sameNumbers(a: ResultObject, b: ResultObject): boolean {
  const ids = new Set([...Object.keys(a.figures), ...Object.keys(b.figures)]);
  for (const id of ids) {
    const fa = a.figures[id];
    const fb = b.figures[id];
    if (!fa || !fb) return false;
    if (fa.value !== fb.value || fa.display !== fb.display || fa.unit !== fb.unit) return false;
    if ((fa.reason ?? null) !== (fb.reason ?? null)) return false;
  }
  return true;
}

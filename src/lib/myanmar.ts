import { ZawgyiConverter, ZawgyiDetector } from "./vendor/myanmar-tools";

let detector: ZawgyiDetector | null = null;
let converter: ZawgyiConverter | null = null;

/** Converts Zawgyi-encoded Burmese to Unicode when the detector is confident. */
export function toUnicode(text: string): { text: string; wasZawgyi: boolean } {
  if (!text || !/[က-႟]/.test(text)) return { text, wasZawgyi: false };
  detector ??= new ZawgyiDetector();
  const p = detector.getZawgyiProbability(text);
  if (p < 0.95) return { text, wasZawgyi: false };
  converter ??= new ZawgyiConverter();
  return { text: converter.zawgyiToUnicode(text), wasZawgyi: true };
}

const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";
export function mmDigitsToLatin(s: string) {
  return s.replace(/[၀-၉]/g, (d) => String(MM_DIGITS.indexOf(d)));
}

export function formatMMK(n: number | null | undefined) {
  if (n == null) return "-";
  return `${n.toLocaleString("en-US")} ကျပ်`;
}

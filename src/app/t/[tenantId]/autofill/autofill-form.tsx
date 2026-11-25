"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { VoiceRecorder } from "@/components/voice-recorder";
import type { AutofillState } from "../actions";

const STAGES = [
  "လုပ်ငန်းအကြောင်း ဖတ်/နားထောင်နေပါတယ်…",
  "စျေးကွက်နဲ့ ပြိုင်ဘက်တွေကို သုတေသန လုပ်နေပါတယ်…",
  "Customer စိတ်ပညာနဲ့ အရောင်းနည်းဗျူဟာ စဉ်းစားနေပါတယ်…",
  "FAQ နဲ့ Objection ဖြေနည်းတွေ ရေးနေပါတယ်…",
  "Data တွေ ဖြည့်ပြီး စစ်ဆေးနေပါတယ်…",
];

export function AutofillForm({
  tenantId,
  action,
  labels,
}: {
  tenantId: string;
  action: (prev: AutofillState, fd: FormData) => Promise<AutofillState>;
  labels: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [stage, setStage] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 22000);
    return () => clearInterval(t);
  }, [pending]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const file = fd.get("audioFile");
    if (file instanceof File && file.size === 0) fd.delete("audioFile");
    if (audio) fd.set("audio", audio, `voice.${audio.type.includes("mp4") ? "m4a" : "webm"}`);
    const audioSize = (audio?.size ?? 0) + (file instanceof File ? file.size : 0);
    if (audioSize > 4_000_000) return setErr("အသံဖိုင် ကြီးလွန်းပါတယ် (4MB အောက်) — ပိုတိုတိုပြောပါ");
    if (!String(fd.get("text") ?? "").trim() && !audioSize) return setErr("စာရေး (သို့) အသံနဲ့ ပြောပေးပါ");
    setStage(0);
    startTransition(() => formAction(fd));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-panel p-5 shadow-sm">
        <input type="hidden" name="tenantId" value={tenantId} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">✍️ လုပ်ငန်းအကြောင်း ရေးပါ</span>
          <textarea
            name="text"
            rows={7}
            className="input"
            placeholder={
              "ဥပမာ —\nဘာရောင်းလဲ / ဘာဝန်ဆောင်မှုပေးလဲ၊ စျေးနှုန်း၊ ဘယ်သူတွေ ဝယ်ကြလဲ၊ သူတို့ ဘာပြဿနာရှိလဲ၊ ကိုယ့်ဆီမှာ ဘာထူးလဲ၊ ဘယ်လို ပို့ပေး/ပေးအပ်လဲ၊ ငွေဘယ်လိုချေလဲ၊ Promotion ရှိလား…\n(သိသလောက်ပဲ ရေးပါ — ကျန်တာ AI က စဉ်းစားဖြည့်ပေးပါမယ်)"
            }
          />
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium">🎙️ (သို့) အသံနဲ့ ပြောပါ</span>
          <VoiceRecorder onChange={setAudio} />
          <label className="mt-2 block text-xs text-muted">
            အသံဖိုင် ရှိပြီးသားဆိုရင်: <input type="file" name="audioFile" accept="audio/*" className="text-xs" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="overwrite" className="mt-1 accent-[var(--brand)]" />
          <span>
            ဖြည့်ပြီးသား နေရာတွေကိုပါ AI အဖြေနဲ့ အစားထိုးမည်
            <span className="block text-xs text-muted">မအမှန်ခြစ်ရင် ဗလာ နေရာတွေကိုပဲ ဖြည့်ပါမယ် (အကြံပြု)</span>
          </span>
        </label>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "AI အလုပ်လုပ်နေပါတယ်…" : "🪄 AI ကို Analysis လုပ်ပြီး အကုန်ဖြည့်ခိုင်းမည်"}
        </button>
        {pending && (
          <div className="rounded-lg bg-brand-soft p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-brand">
              <span className="h-2 w-2 animate-ping rounded-full bg-brand" /> {STAGES[stage]}
            </div>
            <p className="mt-1 text-xs text-muted">Deep thinking နဲ့ သုတေသန လုပ်နေလို့ ၁–၃ မိနစ်လောက် ကြာနိုင်ပါတယ်။ ဒီစာမျက်နှာကို မပိတ်ပါနဲ့။</p>
          </div>
        )}
      </form>

      {state && !state.ok && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <AutofillResultView tenantId={tenantId} r={state} labels={labels} />}
    </div>
  );
}

function AutofillResultView({ tenantId, r, labels }: { tenantId: string; r: NonNullable<AutofillState>; labels: Record<string, string> }) {
  const b = `/t/${tenantId}`;
  return (
    <div className="space-y-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-5">
      <h2 className="text-lg font-semibold">✅ AI ဖြည့်ပြီးပါပြီ — ပြန်စစ်ပြီး လိုသလို ပြင်ပါ</h2>
      {r.transcript && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">သင်ပြောခဲ့တာ (စာသား)</summary>
          <p className="mt-2 whitespace-pre-wrap rounded bg-white p-3">{r.transcript}</p>
        </details>
      )}
      <ul className="space-y-2 text-sm">
        <li>
          📋 <Link className="font-medium text-brand underline" href={`${b}/setup`}>လုပ်ငန်းအချက်အလက်</Link> — {r.filledKeys.length} ခု ဖြည့်ပြီး
          {r.filledKeys.length > 0 && <span className="text-muted">: {r.filledKeys.map((k) => labels[k] ?? k).join("၊ ")}</span>}
        </li>
        <li>
          📦 <Link className="font-medium text-brand underline" href={`${b}/products`}>ပစ္စည်း/ဝန်ဆောင်မှု</Link> — {r.addedProducts.length ? r.addedProducts.join("၊ ") : "အသစ်မရှိ"}
        </li>
        <li>
          💡 <Link className="font-medium text-brand underline" href={`${b}/knowledge`}>FAQ {r.addedFaqs} ခု၊ Objection ဖြေနည်း {r.addedObjections} ခု</Link>
        </li>
        {r.updatedSettings.length > 0 && <li>⚙️ Setting: {r.updatedSettings.join("၊ ")}</li>}
      </ul>
      {r.todo.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">⚠️ ဒါတွေကို AI မခန့်မှန်းပါ — သင်ကိုယ်တိုင် ဖြည့်ပေးရပါမယ်</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {r.todo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {r.summary && (
        <div>
          <p className="mb-1 text-sm font-semibold">🎯 Business Coach အကြံပြုချက်</p>
          <p className="whitespace-pre-wrap text-sm">{r.summary}</p>
        </div>
      )}
      <Link href={`${b}/test`} className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        🧪 Thiri ကို အခုပဲ စမ်းကြည့်မည်
      </Link>
    </div>
  );
}

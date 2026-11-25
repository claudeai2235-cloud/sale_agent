"use client";

import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 180;

/** Records a voice note in the browser (webm on Chrome/Android, mp4 on Safari/iPhone). */
export function VoiceRecorder({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        setState("done");
        onChange(blob);
      };
      r.start(1000);
      rec.current = r;
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setState("error");
      setError("Microphone ဖွင့်ခွင့် မရပါ — Browser ရဲ့ ခွင့်ပြုချက်ကို စစ်ပါ (သို့) စာနဲ့ ရေးပါ");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (rec.current?.state === "recording") rec.current.stop();
  }

  function reset() {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setState("idle");
    setSeconds(0);
    onChange(null);
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      {state === "idle" || state === "error" ? (
        <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">
          🎙️ အသံနဲ့ ပြောမည် (အများဆုံး ၃ မိနစ်)
        </button>
      ) : state === "recording" ? (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-sm">{mm}</span>
          <button type="button" onClick={stop} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">
            ⏹ ရပ်မည်
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {url && <audio src={url} controls className="h-9" />}
          <button type="button" onClick={reset} className="text-sm text-red-600">
            ဖျက်ပြီး ပြန်ပြောမည်
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

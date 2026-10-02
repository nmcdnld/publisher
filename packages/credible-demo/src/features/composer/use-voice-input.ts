// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API is not in TypeScript's DOM library yet.
interface SpeechRecognitionResultLike {
   isFinal: boolean;
   0: { transcript: string };
}
interface SpeechRecognitionEventLike {
   resultIndex: number;
   results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
   continuous: boolean;
   interimResults: boolean;
   lang: string;
   start(): void;
   stop(): void;
   abort(): void;
   onresult: ((e: SpeechRecognitionEventLike) => void) | null;
   onerror: ((e: { error: string }) => void) | null;
   onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const Recognition: SpeechRecognitionCtor | undefined =
   typeof window === "undefined"
      ? undefined
      : ((window as unknown as Record<string, SpeechRecognitionCtor>)
           .SpeechRecognition ??
        (window as unknown as Record<string, SpeechRecognitionCtor>)
           .webkitSpeechRecognition);

const errorText: Record<string, string> = {
   "not-allowed": "Microphone access was blocked. Allow it in your browser.",
   "service-not-allowed": "This browser doesn't allow speech recognition here.",
   "audio-capture": "No microphone was found.",
   network: "Speech recognition needs a network connection.",
};

/**
 * Dictation through the browser's speech recognizer. `onTranscript` gets the
 * whole transcript so far on every result, interim words included, so the
 * caller can show it as it is spoken. `level` is the microphone's loudness,
 * 0 to 1, for a meter.
 */
export function useVoiceInput({
   onTranscript,
   onError,
}: {
   onTranscript: (text: string, final: boolean) => void;
   onError: (message: string) => void;
}) {
   const [listening, setListening] = useState(false);
   const [level, setLevel] = useState(0);
   const recognition = useRef<SpeechRecognitionLike | null>(null);
   const stopMeter = useRef<() => void>(() => {});
   const callbacks = useRef({ onTranscript, onError });
   callbacks.current = { onTranscript, onError };

   const startMeter = useCallback(async () => {
      try {
         const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
         });
         const ctx = new AudioContext();
         const analyser = ctx.createAnalyser();
         analyser.fftSize = 256;
         ctx.createMediaStreamSource(stream).connect(analyser);
         const data = new Uint8Array(analyser.frequencyBinCount);
         let frame = 0;
         const tick = () => {
            analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
            setLevel(Math.min(1, peak / 64));
            frame = requestAnimationFrame(tick);
         };
         tick();
         stopMeter.current = () => {
            cancelAnimationFrame(frame);
            stream.getTracks().forEach((t) => t.stop());
            void ctx.close();
            setLevel(0);
         };
      } catch {
         // The recognizer reports a blocked microphone itself.
      }
   }, []);

   const stop = useCallback(() => {
      recognition.current?.stop();
   }, []);

   const start = useCallback(() => {
      if (!Recognition || recognition.current) return;
      const r = new Recognition();
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || "en-US";
      let finalText = "";
      r.onresult = (e) => {
         let interim = "";
         for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i];
            if (result.isFinal) finalText += result[0].transcript;
            else interim += result[0].transcript;
         }
         callbacks.current.onTranscript(finalText + interim, !interim);
      };
      r.onerror = (e) => {
         if (e.error === "aborted" || e.error === "no-speech") return;
         callbacks.current.onError(
            errorText[e.error] ?? `Voice input stopped: ${e.error}.`,
         );
      };
      r.onend = () => {
         recognition.current = null;
         stopMeter.current();
         setListening(false);
      };
      recognition.current = r;
      r.start();
      setListening(true);
      void startMeter();
   }, [startMeter]);

   useEffect(
      () => () => {
         recognition.current?.abort();
         stopMeter.current();
      },
      [],
   );

   return {
      supported: !!Recognition,
      listening,
      level,
      start,
      stop,
      toggle: listening ? stop : start,
   };
}

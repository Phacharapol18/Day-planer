import { Planner, isNative } from './planner';

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function webRecognizer(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceAvailable = () => isNative || !!webRecognizer();

/** One-shot dictation: Android's system recognizer in the app, the Web Speech API in browsers. */
export async function dictate(prompt = 'What’s on your mind?'): Promise<string> {
  if (isNative) return (await Planner.listen({ prompt })).text;
  const Ctor = webRecognizer();
  if (!Ctor) throw new Error('unavailable');
  return new Promise((resolve, reject) => {
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;
    let text = '';
    r.onresult = (e) => {
      text = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? '')
        .join(' ')
        .trim();
    };
    r.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve('') : reject(new Error(e.error)));
    r.onend = () => resolve(text);
    r.start();
  });
}

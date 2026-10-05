/**
 * What does an EMPTY transcript mean?
 *
 * «لم نسمع تلاوة واضحة» is only honest when the microphone really was quiet. If the level meter
 * shows that sound reached the microphone and recognition still returned nothing, the recognition
 * service failed — telling the user "we didn't hear you" is wrong and hides the real problem.
 */
import { SpeechError } from "./types";

/** Mic level (0..1, see createLevelMeter) above which sound clearly reached the microphone. */
export const AUDIBLE_LEVEL = 0.4;

/** null → genuine silence (the caller reports «no-speech»); otherwise a specific error. */
export function classifyEmptyTranscript(peakLevel: number, detail: string): SpeechError | null {
  return peakLevel >= AUDIBLE_LEVEL ? new SpeechError("engine-no-result", detail) : null;
}

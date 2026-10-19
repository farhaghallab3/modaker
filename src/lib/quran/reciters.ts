/**
 * Reciters for ayah-by-ayah audio, served by EveryAyah (everyayah.com/data/<folder>/SSSAAA.mp3).
 *
 * Folder names are copied from EveryAyah's own list (everyayah.com/data/recitations.js) and every
 * entry was checked to serve complete audio on a sample of ayahs across the Quran. Reciters whose
 * files were incomplete (e.g. Mustafa Ismail 48kbps) are deliberately left out.
 * To add one: copy its exact `subfolder` from recitations.js and check a few ayahs return 200.
 */
import { useSyncExternalStore } from "react";

export type RecitationStyle = "murattal" | "mujawwad" | "muallim";

export interface Reciter {
  id: string;
  name: string;
  style: RecitationStyle;
  /** EveryAyah folder. */
  folder: string;
}

export const STYLE_LABEL: Record<RecitationStyle, string> = {
  murattal: "مرتّل",
  mujawwad: "مجوّد",
  muallim: "المعلّم",
};

export const RECITERS: Reciter[] = [
  { id: "alafasy", name: "مشاري راشد العفاسي", style: "murattal", folder: "Alafasy_128kbps" },
  { id: "minshawi", name: "محمد صديق المنشاوي", style: "murattal", folder: "Minshawy_Murattal_128kbps" },
  { id: "minshawi-mujawwad", name: "محمد صديق المنشاوي", style: "mujawwad", folder: "Minshawy_Mujawwad_192kbps" },
  { id: "banna", name: "محمود علي البنا", style: "murattal", folder: "mahmoud_ali_al_banna_32kbps" },
  { id: "tablawi", name: "محمد محمود الطبلاوي", style: "murattal", folder: "Mohammad_al_Tablaway_128kbps" },
  { id: "qatami", name: "ناصر القطامي", style: "murattal", folder: "Nasser_Alqatami_128kbps" },
  { id: "shatri", name: "أبو بكر الشاطري", style: "murattal", folder: "Abu_Bakr_Ash-Shaatree_128kbps" },
  { id: "husary", name: "محمود خليل الحصري", style: "murattal", folder: "Husary_128kbps" },
  { id: "husary-mujawwad", name: "محمود خليل الحصري", style: "mujawwad", folder: "Husary_128kbps_Mujawwad" },
  { id: "husary-muallim", name: "محمود خليل الحصري", style: "muallim", folder: "Husary_Muallim_128kbps" },
  { id: "abdulbasit", name: "عبد الباسط عبد الصمد", style: "murattal", folder: "Abdul_Basit_Murattal_192kbps" },
  { id: "abdulbasit-mujawwad", name: "عبد الباسط عبد الصمد", style: "mujawwad", folder: "Abdul_Basit_Mujawwad_128kbps" },
  { id: "sudais", name: "عبد الرحمن السديس", style: "murattal", folder: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "shuraim", name: "سعود الشريم", style: "murattal", folder: "Saood_ash-Shuraym_128kbps" },
  { id: "muaiqly", name: "ماهر المعيقلي", style: "murattal", folder: "MaherAlMuaiqly128kbps" },
  { id: "ghamdi", name: "سعد الغامدي", style: "murattal", folder: "Ghamadi_40kbps" },
  { id: "dossari", name: "ياسر الدوسري", style: "murattal", folder: "Yasser_Ad-Dussary_128kbps" },
  { id: "hudhaifi", name: "علي الحذيفي", style: "murattal", folder: "Hudhaify_128kbps" },
  { id: "ayyoub", name: "محمد أيوب", style: "murattal", folder: "Muhammad_Ayyoub_128kbps" },
  { id: "jibreel", name: "محمد جبريل", style: "murattal", folder: "Muhammad_Jibreel_128kbps" },
  { id: "ajamy", name: "أحمد بن علي العجمي", style: "murattal", folder: "Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net" },
  { id: "basfar", name: "عبد الله بصفر", style: "murattal", folder: "Abdullah_Basfar_192kbps" },
  { id: "rifai", name: "هاني الرفاعي", style: "murattal", folder: "Hani_Rifai_192kbps" },
  { id: "qahtani", name: "خالد القحطاني", style: "murattal", folder: "Khaalid_Abdullaah_al-Qahtaanee_192kbps" },
  { id: "bukhatir", name: "صلاح بو خاطر", style: "murattal", folder: "Salaah_AbdulRahman_Bukhatir_128kbps" },
];

export const DEFAULT_RECITER_ID = "alafasy";

export function getReciter(id: string | null | undefined): Reciter {
  return RECITERS.find((r) => r.id === id) ?? RECITERS.find((r) => r.id === DEFAULT_RECITER_ID)!;
}

/** "مشاري راشد العفاسي" or "محمود خليل الحصري (مجوّد)" — the style is shown only when it isn't murattal. */
export function reciterLabel(r: Reciter): string {
  return r.style === "murattal" ? r.name : `${r.name} (${STYLE_LABEL[r.style]})`;
}

export function reciterAudioUrl(r: Reciter, surah: number, ayah: number): string {
  return `https://everyayah.com/data/${r.folder}/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
}

// ── The learner's chosen reciter (per device; shared by every player on the page) ──

const KEY = "muzakkir:reciter";
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return window.localStorage.getItem(KEY) ?? DEFAULT_RECITER_ID;
  } catch {
    return DEFAULT_RECITER_ID;
  }
}

export function setReciterId(id: string): void {
  try {
    window.localStorage.setItem(KEY, getReciter(id).id);
  } catch {
    /* storage blocked — the choice lasts for this page only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** The chosen reciter; the default on the server and before hydration. */
export function useReciter(): Reciter {
  const id = useSyncExternalStore(subscribe, readStored, () => DEFAULT_RECITER_ID);
  return getReciter(id);
}

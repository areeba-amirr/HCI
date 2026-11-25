import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DIARY_EMOJIS } from "@/lib/diary";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Google's OpenAI-compatible endpoint, so requests and responses keep their existing format.
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
// gemini-2.5-flash returns 404 for new API keys ("no longer available to new users").
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
// Legacy path for deployments that have not set GEMINI_API_KEY yet.
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-2.5-flash";

const AI_TIMEOUT_MS = 60_000;
const MAX_IMAGE_CHARS = 15_000_000; // about 11 MB once decoded; Gemini caps inline requests at 20 MB

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const recentCalls = new Map<string, number[]>();

// Per server instance, so this limits bursts from one account rather than total usage.
// The hard ceiling on spend is the quota set on the key in Google Cloud.
function isRateLimited(userId: string) {
  const now = Date.now();
  if (recentCalls.size > 10_000) recentCalls.clear();
  const calls = (recentCalls.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  const limited = calls.length >= RATE_LIMIT;
  if (!limited) calls.push(now);
  recentCalls.set(userId, calls);
  return limited;
}

// Every AI endpoint requires a signed-in user, then applies the per-user limit.
const aiGuard = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    if (isRateLimited(context.userId)) {
      throw new Response("Too many AI requests. Please wait a minute and try again.", { status: 429 });
    }
    return next();
  });

function aiProvider() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return {
      url: GEMINI_ENDPOINT,
      key: geminiKey,
      model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      isGemini: true,
    };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    return { url: LOVABLE_GATEWAY, key: lovableKey, model: LOVABLE_MODEL, isGemini: false };
  }
  console.error("GEMINI_API_KEY not configured");
  throw new Error("The AI service is not configured.");
}

// Google's docs don't say whether this keyword is accepted in tool schemas, and
// nothing depends on it: results are read field by field.
function withoutAdditionalProperties<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutAdditionalProperties) as T;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([key]) => key !== "additionalProperties")
      .map(([key, v]) => [key, withoutAdditionalProperties(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

async function requestAI(url: string, key: string, payload: string, retry = true): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: payload,
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (e) {
    console.error("AI request failed", e instanceof Error ? e.name : "unknown");
    throw new Error("The AI service did not respond. Please try again.");
  }
  // Gemini returns 500/503 when briefly overloaded. A 429 means quota, so retrying won't help.
  if ((res.status === 500 || res.status === 503) && retry) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return requestAI(url, key, payload, false);
  }
  return res;
}

async function callAI(body: Record<string, unknown>) {
  const { url, key, model, isGemini } = aiProvider();
  const payload = { model, ...(isGemini ? withoutAdditionalProperties(body) : body) };
  const res = await requestAI(url, key, JSON.stringify(payload));
  if (res.status === 429) throw new Error("Rate limit exceeded. Please wait a moment and try again.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage.");
  if (res.status === 500 || res.status === 503) {
    throw new Error("The AI service is busy. Please try again shortly.");
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("AI request error", res.status, t.slice(0, 500));
    throw new Error(`AI request failed (${res.status})`);
  }
  return res.json();
}

function parseToolCall(data: any) {
  const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) {
    // Fallback: try parsing content as JSON
    const content = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    try { return JSON.parse(cleaned); } catch { throw new Error("AI returned invalid response"); }
  }
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    throw new Error("AI returned malformed structured output");
  }
}

const medicineSchema = {
  type: "object",
  properties: {
    medicine_name: { type: "string" },
    medicine_name_urdu: { type: "string" },
    dosage: { type: "string" },
    dosage_urdu: { type: "string" },
    frequency: { type: "string" },
    frequency_urdu: { type: "string" },
    instructions: { type: "string" },
    instructions_urdu: { type: "string" },
    warnings: { type: "string" },
    warnings_urdu: { type: "string" },
    food_interactions: { type: "string" },
    food_interactions_urdu: { type: "string" },
    is_dangerous: { type: "boolean" },
  },
  required: [
    "medicine_name", "medicine_name_urdu", "dosage", "dosage_urdu",
    "frequency", "frequency_urdu", "instructions", "instructions_urdu",
    "warnings", "warnings_urdu",
    "food_interactions", "food_interactions_urdu", "is_dangerous",
  ],
  additionalProperties: false,
};

const MEDICINE_TEXT_FIELDS = [
  "medicine_name", "medicine_name_urdu",
  "dosage", "dosage_urdu",
  "frequency", "frequency_urdu",
  "instructions", "instructions_urdu",
  "warnings", "warnings_urdu",
  "food_interactions", "food_interactions_urdu",
] as const;

function applyMedicineFallbacks(med: Record<string, any>) {
  const out: Record<string, any> = { ...med };
  for (const k of MEDICINE_TEXT_FIELDS) {
    const v = out[k];
    const empty = v === null || v === undefined ||
      (typeof v === "string" && (v.trim() === "" ||
        /^(not\s*specified|n\/?a|unknown|none)$/i.test(v.trim()) ||
        v.trim() === "درج نہیں"));
    if (empty) out[k] = k.endsWith("_urdu") ? "دستیاب نہیں" : "N/A";
  }
  out.is_dangerous = out.is_dangerous === true || String(out.is_dangerous).toLowerCase() === "true";
  return out;
}

const imageInput = (d: { imageBase64: string }) => {
  const parsed = z.object({ imageBase64: z.string().min(20) }).parse(d);
  if (parsed.imageBase64.length > MAX_IMAGE_CHARS) {
    throw new Error("This image is too large. Please use a smaller photo.");
  }
  return parsed;
};

export const scanMedicine = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .inputValidator(imageInput)
  .handler(async ({ data }) => {
    const dataUrl = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:image/jpeg;base64,${data.imageBase64}`;

    const promptText = `You are an expert medical assistant. Look at this medicine label image very carefully. Read EVERY word on the label. Extract ALL of this information:
- Medicine name (brand + generic)
- Exact dosage (mg, ml etc)
- How many times per day to take it
- Before or after food instructions
- All warnings and side effects
- Food and drug interactions

If you cannot read something clearly, make your best medical judgment based on the medicine name and type. NEVER return null or "not specified". Always provide medical information based on the medicine name even if label is unclear. Provide Urdu translations for every field. Set is_dangerous=true only for controlled substances, strong sedatives, or medicines requiring strict medical supervision.`;

    const result = await callAI({
      messages: [
        { role: "system", content: promptText },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this medicine label and extract all information." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_medicine",
          description: "Return medicine information in English and Urdu.",
          parameters: medicineSchema,
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_medicine" } },
    });
    return applyMedicineFallbacks(parseToolCall(result));
  });

// ---------------------------------------------------------------------------
// Prescription reading. Every field reports how readable it was, and nothing is guessed:
// the model must leave unclear or missing information empty and say why. The result is
// an unverified reading of the original, never a confirmed instruction.
// ---------------------------------------------------------------------------
const FIELD_STATUS = ["clear", "uncertain", "unreadable", "not_found"] as const;
const RX_FIELDS = ["name", "brand_name", "generic_name", "strength", "dosage", "frequency", "duration", "route", "instructions"] as const;
const QUALITY_ISSUES = ["blurry", "low_resolution", "poor_lighting", "shadows", "cropped", "rotated", "illegible_handwriting", "not_a_prescription"] as const;

const fieldSchema = {
  type: "object",
  properties: {
    value: { type: "string", description: "Exactly as written. Empty string unless status is clear or uncertain." },
    value_urdu: { type: "string", description: "Urdu rendering of value. Empty when value is empty." },
    status: { type: "string", enum: FIELD_STATUS },
    reason: { type: "string", description: "Why the field is not clear. Empty when clear." },
  },
  required: ["value", "value_urdu", "status", "reason"],
  additionalProperties: false,
};

const rxSchema = {
  type: "object",
  properties: {
    image_quality: {
      type: "object",
      properties: {
        usable: { type: "boolean", description: "false if the image cannot be read reliably" },
        issues: { type: "array", items: { type: "string", enum: QUALITY_ISSUES } },
        note: { type: "string" },
      },
      required: ["usable", "issues", "note"],
      additionalProperties: false,
    },
    medicines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...Object.fromEntries(RX_FIELDS.map((f) => [f, fieldSchema])),
          name_alternatives: {
            type: "array",
            items: { type: "string" },
            description: "Other readings the handwriting genuinely supports. Empty if none.",
          },
        },
        required: [...RX_FIELDS, "name_alternatives"],
        additionalProperties: false,
      },
    },
    doctor_notes: fieldSchema,
    written_warnings: fieldSchema,
  },
  required: ["image_quality", "medicines", "doctor_notes", "written_warnings"],
  additionalProperties: false,
};

const RX_PROMPT = `You read doctors' prescriptions for patients in Pakistan. A patient may act on what you report, so an honest "I can't read this" is always better than a plausible guess.

For each medicine, report these fields: name, brand_name, generic_name, strength, dosage, frequency, duration, route, instructions.
For EVERY field set status to exactly one of:
- "clear": you can read it with confidence. Copy it exactly as written.
- "uncertain": you can partly read it but it could be something else. Give your best reading in value and explain the doubt in reason.
- "unreadable": something is written there but you cannot read it. value must be empty. Explain in reason.
- "not_found": the prescription does not contain this information. value must be empty.

Rules you must follow:
1. Never invent information. Never fill a field from general medical knowledge, typical doses or what a medicine is "usually" taken for.
2. Never correct a misspelled or unclear medicine name to a known drug unless the writing itself clearly supports it. If the handwriting could be more than one medicine, set name to "uncertain" and list the genuine alternatives in name_alternatives.
3. Never guess a dose, strength, frequency or duration. If any digit or unit is unclear, the field is "uncertain" or "unreadable".
4. Missing is not zero and not a default. If no duration is written, duration is "not_found".
5. You may expand a standard abbreviation only when the abbreviation itself is clearly written: TDS = three times a day, BD = twice a day, OD = once a day, QID = four times a day, PC = after food, AC = before food, HS = at bedtime, SOS/PRN = when needed, x7d = for 7 days.
6. brand_name and generic_name: only if written on the prescription.
7. written_warnings: only warnings or interaction notes the doctor actually wrote. Do not add your own.
8. value_urdu: translate value into Urdu. Leave it empty when value is empty. Keep numbers and units as written.

First judge the image. Set image_quality.usable to false, and return no medicines, if the image is too blurry, dark, cropped, rotated or illegible to read reliably, or if it is not a prescription.`;

const MAX_RX_PAGES = 5;

const rxInput = (d: { pages: string[] }) => {
  const parsed = z.object({ pages: z.array(z.string().min(20)).min(1) }).parse(d);
  if (parsed.pages.length > MAX_RX_PAGES) throw new Error("This document has too many pages.");
  if (parsed.pages.reduce((n, p) => n + p.length, 0) > MAX_IMAGE_CHARS) {
    throw new Error("This image is too large. Please use a smaller photo.");
  }
  return parsed;
};

type RxField = { value: string | null; value_urdu: string | null; status: (typeof FIELD_STATUS)[number]; reason: string | null };

/** Server-side checks that the model's statuses are consistent, without trusting them. */
function normaliseField(raw: any, field?: string): RxField {
  const status = FIELD_STATUS.includes(raw?.status) ? raw.status : "uncertain";
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  let value = text(raw?.value);
  let reason = text(raw?.reason);
  let finalStatus: RxField["status"] = status;
  // A value claimed for an unreadable or missing field is discarded, never shown.
  if (status === "unreadable" || status === "not_found") value = null;
  // "Clear" with nothing in it means nothing was found.
  if (status === "clear" && !value) finalStatus = "not_found";
  // A strength with no digit can't be a clear strength.
  if (field === "strength" && finalStatus === "clear" && value && !/\d/.test(value)) {
    finalStatus = "uncertain";
    reason = reason ?? "No number could be identified in the strength.";
  }
  if (status === "uncertain" && !reason) reason = "The model reported this as uncertain.";
  return { value, value_urdu: value ? text(raw?.value_urdu) : null, status: finalStatus, reason: finalStatus === "clear" ? null : reason };
}

function normalisePrescription(raw: any) {
  const quality = raw?.image_quality ?? {};
  const usable = quality.usable !== false;
  const medicines = usable && Array.isArray(raw?.medicines)
    ? raw.medicines.map((m: any) => ({
        fields: Object.fromEntries(RX_FIELDS.map((f) => [f, normaliseField(m?.[f], f)])),
        name_alternatives: Array.isArray(m?.name_alternatives)
          ? m.name_alternatives.filter((a: unknown) => typeof a === "string" && a.trim()).slice(0, 4)
          : [],
      }))
    : [];
  return {
    image_quality: {
      usable,
      issues: Array.isArray(quality.issues) ? quality.issues.filter((i: unknown) => QUALITY_ISSUES.includes(i as any)) : [],
      note: typeof quality.note === "string" && quality.note.trim() ? quality.note.trim() : null,
    },
    medicines,
    doctor_notes: normaliseField(raw?.doctor_notes),
    written_warnings: normaliseField(raw?.written_warnings),
  };
}

export const scanPrescription = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .inputValidator(rxInput)
  .handler(async ({ data }) => {
    const { model } = aiProvider();
    const pages = data.pages.map((p) => (p.startsWith("data:") ? p : `data:image/jpeg;base64,${p}`));
    const result = await callAI({
      temperature: 0,
      messages: [
        { role: "system", content: RX_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: pages.length > 1
                ? `These are the ${pages.length} pages of one prescription, in order. Report every medicine on them.`
                : "Report every medicine on this prescription.",
            },
            ...pages.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_prescription",
          description: "Report the prescription's medicines with a readability status for every field.",
          parameters: rxSchema,
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_prescription" } },
    });
    return { model, extraction: normalisePrescription(parseToolCall(result)) };
  });

// ---------------------------------------------------------------------------
// Medicine packaging (box or strip), used as supporting evidence when a medicine on a
// handwritten prescription couldn't be read. Unlike scanMedicine, this reads ONLY what is
// printed: nothing is inferred from medical knowledge, and an unreadable field comes back
// empty. The result is never saved by itself and never confirms anything: the patient
// compares it with the prescription and decides.
// ---------------------------------------------------------------------------

const PACKAGING_FIELDS = ["name", "generic_name", "strength"] as const;

const packagingSchema = {
  type: "object",
  properties: {
    is_medicine_packaging: {
      type: "boolean",
      description: "False if the photo is not of a medicine box, strip, bottle or label.",
    },
    ...Object.fromEntries(PACKAGING_FIELDS.map((f) => [f, fieldSchema])),
  },
  required: ["is_medicine_packaging", ...PACKAGING_FIELDS],
  additionalProperties: false,
};

const PACKAGING_PROMPT = `You read the printed text on a medicine's packaging (box, strip, bottle or label) for a patient in Pakistan who could not read their doctor's handwriting. The patient will compare what you report with their prescription, so an honest "I can't read this" is always better than a plausible guess.

Report three fields: name (the brand or product name as printed), generic_name (the active ingredient, only if printed), strength (for example "625 mg", only if printed).
For EVERY field set status to exactly one of:
- "clear": printed and you can read it with confidence. Copy it exactly as printed.
- "uncertain": partly readable. Give your best reading in value and explain the doubt in reason.
- "unreadable": printed but you cannot read it. value must be empty.
- "not_found": not visible in the photo. value must be empty.

Rules: never infer a name, ingredient or strength from medical knowledge, from the shape or colour of the packaging, or from what a medicine is usually like. Never correct printed text to a different known drug. If the photo is not medicine packaging, set is_medicine_packaging to false and every field to "not_found". value_urdu may stay empty.`;

export const readPackaging = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .inputValidator(imageInput)
  .handler(async ({ data }) => {
    const url = data.imageBase64.startsWith("data:")
      ? data.imageBase64
      : `data:image/jpeg;base64,${data.imageBase64}`;
    const result = await callAI({
      temperature: 0,
      messages: [
        { role: "system", content: PACKAGING_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Report only what is printed on this medicine packaging." },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "read_packaging",
            description:
              "Report the printed name, ingredient and strength, each with a readability status.",
            parameters: packagingSchema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "read_packaging" } },
    });
    const raw = parseToolCall(result);
    const isPackaging = raw?.is_medicine_packaging !== false;
    const fields = Object.fromEntries(
      PACKAGING_FIELDS.map((f) => [
        f,
        isPackaging
          ? normaliseField(raw?.[f], f)
          : { value: null, value_urdu: null, status: "not_found" as const, reason: null },
      ]),
    ) as Record<(typeof PACKAGING_FIELDS)[number], RxField>;
    return { isPackaging, fields };
  });

// ---------------------------------------------------------------------------
// Voice diary. The AI turns what the patient said into an editable draft. It never
// decides anything: values the patient didn't mention come back empty, timeline entries
// and emojis are suggestions, and nothing is saved until the patient presses Save.
// ---------------------------------------------------------------------------

const symptomsSchema = {
  type: "object",
  properties: {
    pain_level: { type: "integer", minimum: 0, maximum: 10, description: "0 if the patient did not give a pain level" },
    sleep_hours: { type: "number", minimum: -1, maximum: 24, description: "-1 if the patient did not say how long they slept" },
    mood: { type: "string", enum: ["happy", "okay", "sad", "not_mentioned"] },
    notes: { type: "string", description: "Short English summary of only what was said" },
    notes_urdu: { type: "string", description: "The same summary in Urdu" },
    timeline: {
      type: "array",
      description: "Separate things the patient described, in the order they said them",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "One event or symptom, in plain English" },
          time: { type: "string", description: "24-hour HH:MM only if the patient said a time; otherwise empty" },
          emoji: { type: "string", enum: [...DIARY_EMOJIS, ""], description: "A suggestion only; empty if none fits" },
        },
        required: ["text", "time", "emoji"],
        additionalProperties: false,
      },
    },
  },
  required: ["pain_level", "sleep_hours", "mood", "notes", "notes_urdu", "timeline"],
  additionalProperties: false,
};

const SYMPTOMS_PROMPT = `You help a patient in Pakistan keep a symptom diary. They describe their day in Urdu or English. Your output is only a draft that the patient will check, edit and save themselves.

Rules:
1. Report only what the patient actually said. Never guess, never fill in typical values.
2. pain_level: the number they gave, or one they clearly described (e.g. "very bad pain" is not a number: use 0). Use 0 when they gave no pain level.
3. sleep_hours: only if they said how long they slept, otherwise -1.
4. mood: only if they described how they feel, otherwise "not_mentioned".
5. timeline: one entry per distinct event or symptom, in the order they said them. Give a time only if they said one ("at 3pm" -> "15:00", "in the morning" is not a time: leave it empty). Never invent dates or times.
6. emoji: an optional suggestion from the allowed list, or empty.
7. notes and notes_urdu: a short, faithful summary. No advice, no diagnosis.`;

export const extractSymptoms = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .inputValidator((d: { transcript: string }) => z.object({ transcript: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const result = await callAI({
      temperature: 0,
      messages: [
        { role: "system", content: SYMPTOMS_PROMPT },
        { role: "user", content: `Patient said: "${data.transcript}"` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_symptoms",
          description: "Turn the patient's words into an editable diary draft.",
          parameters: symptomsSchema,
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_symptoms" } },
    });
    const r = parseToolCall(result);
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const pain = Number.isInteger(r.pain_level) && r.pain_level >= 1 && r.pain_level <= 10 ? r.pain_level : null;
    const sleep = typeof r.sleep_hours === "number" && r.sleep_hours >= 0 && r.sleep_hours <= 24 ? r.sleep_hours : null;
    return {
      // null means "not mentioned": the patient fills it in, MediSnap never picks a default.
      pain_level: pain as number | null,
      sleep_hours: sleep as number | null,
      mood: (["happy", "okay", "sad"].includes(r.mood) ? r.mood : null) as "happy" | "okay" | "sad" | null,
      notes: text(r.notes),
      notes_urdu: text(r.notes_urdu),
      timeline: (Array.isArray(r.timeline) ? r.timeline : [])
        .map((e: any) => ({
          text: text(e?.text),
          time: /^([01]\d|2[0-3]):[0-5]\d$/.test(text(e?.time)) ? text(e.time) : "",
          emoji: (DIARY_EMOJIS as readonly string[]).includes(e?.emoji) ? (e.emoji as string) : "",
        }))
        .filter((e: { text: string }) => e.text)
        .slice(0, 12) as { text: string; time: string; emoji: string }[],
    };
  });


const interactionSchema = {
  type: "object",
  properties: {
    is_safe: { type: "boolean" },
    severity: { type: "string", enum: ["safe","mild","moderate","severe"] },
    explanation: { type: "string" },
    explanation_urdu: { type: "string" },
  },
  required: ["is_safe","severity","explanation","explanation_urdu"],
  additionalProperties: false,
};

export const checkInteraction = createServerFn({ method: "POST" })
  .middleware([aiGuard])
  .inputValidator((d: { medicine1: string; medicine2: string }) =>
    z.object({ medicine1: z.string().min(1).max(200), medicine2: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const result = await callAI({
      messages: [
        { role: "system", content: "You are a clinical pharmacist in Pakistan. Assess whether two medicines have a known drug interaction. Be concise and explain in plain English and clear Urdu." },
        { role: "user", content: `Medicine 1: ${data.medicine1}\nMedicine 2: ${data.medicine2}\nIs it safe to take them together?` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "check_interaction",
          description: "Return drug interaction assessment.",
          parameters: interactionSchema,
        },
      }],
      tool_choice: { type: "function", function: { name: "check_interaction" } },
    });
    return parseToolCall(result);
  });

# MediSnap: AHCI Design Rationale

This document explains how the MediSnap redesign applies Human-Computer Interaction principles. Each claim points to something you can open in the running app or find in the code.

**The product.** MediSnap helps patients in Pakistan understand English medicine labels and doctor's prescriptions by explaining them in Urdu and English. It also offers a symptom diary, a health calendar, an interaction check and a report for the doctor.

**The users, and why they shape the design.** Many users may have limited technical experience or low literacy in English, may be older, and are often on an inexpensive phone. They may also be anxious about their health. A misread dose can cause harm, so preventing errors and being honest about uncertainty matter more here than in most apps.

**What this document can't claim.** No study with real users has been run. The evidence below is design reasoning plus automated checks, so it shows the principles were applied, not that users performed better. See [Limits of this evidence](#limits-of-this-evidence).

---

## 1. Shneiderman's Eight Golden Rules

| Rule | Where to see it |
|---|---|
| **1. Strive for consistency** | One token set and one component set across the app ([styles.css](../src/styles.css), [primitives.tsx](../src/components/app/primitives.tsx)). Every screen opens with the same header: an icon badge matching its navigation entry, then title and description. The calendar is one component ([HealthCalendar.tsx](../src/components/app/HealthCalendar.tsx)) used on the Calendar page, in the Doctor Report and as the landing-page sample, so it behaves the same everywhere. |
| **2. Seek universal usability** | Seven interface languages with right-to-left layout for Urdu and Arabic. Body text uses Atkinson Hyperlegible, designed for low-vision readers. Voice or typed diary entry. Works from 320px to 1920px wide. Low-power devices get a lighter motion design automatically (see [Motion](#9-motion-design)). |
| **3. Offer informative feedback** | A progress bar with a plain description while the AI works, the "Saved to history" panel, filter counts, a live pain label ("5/10 Moderate") and the calendar's month name announced to screen readers when it changes. |
| **4. Design dialogs to yield closure** | The scan flow ends with a success panel offering two next steps. Selecting a calendar day shows that day's full record, and for today it offers the diary. Saving a display name confirms with "Name saved". |
| **5. Prevent errors** | The interaction check won't run on the same medicine twice. Non-image and oversized files are rejected before upload. An empty display name is refused before anything is sent. Discarding an unsaved result and deleting a record both ask first. |
| **6. Permit easy reversal** | Delete has an **Undo** that restores the record unchanged. Photos can be removed, edits cancelled (diary and display name), and "Keep result" backs out of discarding. The calendar's **Today** button returns from any month in one step. |
| **7. Keep users in control** | The AI never saves anything by itself. Voice entry produces a draft: the person edits the transcript, arranges the timeline, chooses every emoji and only then saves. The orbit animation has a pause button and holds still under the pointer or keyboard focus. Scroll-linked effects follow the scrollbar, so the reader sets the pace. |
| **8. Reduce short-term memory load** | Abbreviations are spelled out. The calendar shows pain as a number on each day, so nobody has to remember what a colour meant. Selecting a day shows its entry and medicines together, instead of sending the person between Diary and History. |

## 2. Hick-Hyman Law

Decision time grows with the number of choices, so choices are reduced or grouped.

- **Dashboard:** two large primary actions, with three quieter secondary links below them.
- **Sidebar:** destinations are split into Home, *Understand*, *Track* and *Account*. That turns one list of nine into short groups.
- **Phone navigation:** four everyday destinations plus **More**. Calendar, History, Report, Interaction Check and Settings are one tap away.
- **Landing navigation:** five anchors plus two account actions.
- **One primary button per step:** the scan screen offers only what makes sense at that moment.

## 3. Fitts's Law

Time to hit a target depends on its size and distance.

- **Target size:** controls are at least 44×44 CSS pixels at every tested width from 390px up, checked automatically across seven languages. That's above the WCAG 2.2 AA minimum of 24px. At 320px, calendar days narrow to 35×44px, because seven 44px columns don't fit.
- **Primary actions are largest:** primary scan cards and "Save" buttons are bigger than secondary actions.
- **Thumb reach:** phone navigation sits at the bottom of the screen.
- **Moving targets:** the orbiting links stop when pointed at or focused, and move only about 9 pixels per second.

## 4. Miller's Law (chunking)

The "seven plus or minus two" figure isn't treated as a hard limit. The useful idea is that grouped information is easier to take in.

- AI results arrive in labelled sections, not a block of text.
- A calendar day's details are split into "Symptom diary" (pain, sleep and mood as three short facts) and "Medicines saved".
- Settings groups into Profile, Language, Animation and Account.
- The landing page moves through clear chunks: hero, what it is, features, how it works, showcase, calendar, why, FAQ and closing action.

## 5. Nielsen's Ten Usability Heuristics

| Heuristic | Where to see it |
|---|---|
| **Visibility of system status** | Step indicator, processing panels, diary listening states, translation indicator and the announced calendar month. |
| **Match with the real world** | A real stethoscope photograph sets the healthcare context immediately. The calendar follows the familiar paper layout, with weekday names in the reader's language. |
| **User control and freedom** | Undo, Cancel, Remove photo, Keep result, the Today button and pause on animation. |
| **Consistency and standards** | One calendar component across three places. Standard patterns for navigation, tabs, accordion and dialogs. |
| **Error prevention** | See Golden Rule 5. |
| **Recognition rather than recall** | Days with saved medicines carry a marker. Pain levels show as numbers. Every icon has a label. |
| **Flexibility and efficiency** | The calendar works by mouse, touch or keyboard: arrow keys move day by day, Page Up and Page Down change month, Home and End jump within it. In Urdu and Arabic the arrows follow reading direction. |
| **Aesthetic and minimalist design** | The photograph is the one bold element. Supporting chips name real features and carry no invented data. |
| **Help users recover from errors** | Failed loads explain what happened and offer **Try again** (Calendar, History, Dashboard, Report). Failed scans keep the photo and offer a retry. |
| **Help and documentation** | The FAQ, the calendar's keyboard tip, and inline hints such as the photo tip and display-name hint. |

## 6. Gestalt Principles

- **Proximity:** a day's diary entry and its medicines sit together in one panel.
- **Similarity:** every calendar day has the same shape, so differences in fill colour stand out as meaning.
- **Common region:** panels and the hero's layered lavender shape group related content.
- **Continuity:** the "How it works" line fills as the reader scrolls through the steps.
- **Figure-ground:** the dark wooden photograph stands as a strong figure against the pale lavender page, and the selected calendar day lifts above its neighbours with a ring and shadow.
- **Hierarchy:** large serif headlines, then body text, then quieter notes.

## 7. Jakob's Law

MediSnap uses patterns people already know: a top navigation bar on the landing page, a sidebar on desktop, a bottom tab bar on phones, a monthly calendar grid, previous and next arrows, a Settings page with Profile and Account sections, and a standard FAQ accordion.

## 8. Accessibility (WCAG 2.2 AA)

- **Automated audit:** axe-core reported zero violations across 79 audited states, covering every route (Calendar and Settings included), English, Urdu and Arabic, empty states, error states and open dialogs.
- **Two issues found and fixed in this round:**
  - Calendar day buttons had a spoken name that didn't contain their visible text (2.5.3). The visible day and score now come first, followed by the full date as screen-reader text.
  - The scroll-filled introduction statement started at too little contrast, and now starts at 55% opacity (about 3.7:1 for this large text).
- **Animated text stays readable:** every split headline or paragraph has a plain copy that screen readers read once, and the moving copy is hidden from them. Letters are split only in Latin-script languages, because splitting breaks the joined letters of Urdu, Arabic and Hindi.
- **Keyboard (2.1.1):**
  - A skip link comes first and focus rings are visible.
  - The calendar is fully keyboard-operable, and focus follows the selected day into a new month.
  - The orbit's links stay focusable before their entrance animation has played.
- **Pause, stop, hide (2.2.2):** the orbit has a pause button.
- **Images:** the photograph has descriptive alt text and a visible credit, as its CC BY licence requires.

## 9. Motion Design

| Motion | Its purpose |
|---|---|
| Hero: photo uncovered by a lavender curtain, headline written in, paragraph typed in | One orchestrated arrival that establishes the product |
| Introduction statement filling with ink as you scroll | Pacing the key message to the reader's scroll |
| Section headings rising line by line from a mask | Marking the start of each section |
| Hero parallax | Depth on scroll, under the reader's control |
| Calendar month slide and day selection | Showing what changed and which direction was taken |
| Press, lift, progress and the mic pulse | Feedback |

Different sections use different effects, so the motion doesn't feel repeated.

**Performance work in this round.** The browser was measured, not guessed at, using CPU profiles, frame timing and selectively switching effects off. Three changes came out of it:
- Block reveals moved from GSAP to CSS transitions, so the browser runs them without JavaScript on every frame.
- Blurred-glass hero chips became solid, because a blur over a moving photo is recomputed every frame.
- Parallax tweens are prepared at load instead of mid-scroll.

**Measured results** (Microsoft Edge, production build, scrolling the whole landing page in 4 seconds):

| Path | Normal CPU | CPU slowed 4× |
|---|---|---|
| Full motion | 60 fps | about 5 fps |
| Low-power devices | 60 fps | about 10 fps |
| Reduced motion | 60 fps | about 53 fps |

**What that means:**
- On a capable device everything runs at 60 fps.
- With the CPU slowed 4×, the full design does not keep up. Split-text and scroll-linked effects together are the cost.
- Devices with 4 or fewer CPU cores or 4GB or less memory, or with data saver on, therefore keep the hero entrance and reveals but skip split text, scrubbing, parallax and the orbit spin.
- Throttled measurements on the test machine varied a lot between runs, so testing on a real budget phone is the next step.

**Reduced motion** uses tiers. Movement is removed, short fades remain, and text is never split. Without JavaScript all content, including the photograph, is visible.

## 10. Prescription Safety & Verification

A misread prescription can cause real harm, so this part of the app is designed around one rule: **an AI reading is never presented as a confirmed instruction.**

| Principle | How it is applied |
|---|---|
| **Honesty about uncertainty (calibrated trust)** | Every field (medicine, strength, dose, how often, how long, how taken, instructions) is reported as *Read clearly*, *Uncertain reading*, *Couldn't be read* or *Not on prescription*, with the AI's reason. Nothing is guessed: unreadable fields show "No value", and missing fields are listed as "Not written on the prescription", never filled with defaults. The server re-checks the AI's claims: a "clear" strength without a number becomes uncertain, and a value attached to an unreadable field is discarded. No confidence percentages are shown, because they would read as accuracy. |
| **Error prevention (Shneiderman 5, Nielsen)** | The photo is checked for blur, darkness, washed-out light and low resolution before it is sent. Problems are explained, and reading needs an explicit "Read this file anyway". If the AI judges the image unusable, no medicines are shown at all, only a request for a clearer photo. Files over 20 MB or 5 PDF pages, and password-protected or damaged PDFs, are refused with a specific reason. |
| **Recognition rather than recall** | The original sits beside the extracted fields (sticky on desktop), with zoom buttons, page tabs and a full-screen view, so each value is checked against its source rather than remembered. |
| **Status is never colour alone (WCAG 1.4.1)** | Each status is an icon plus words: *AI read, not checked*, *Confirmed by you*, *Corrected by you*, *Needs professional review*, *Unreadable*, *Professionally verified*. A "What do these labels mean?" legend explains each one. |
| **User control and freedom** | Each field offers *Matches original*, *Correct it*, *Mark as unclear* and *Undo my change*. Nothing is saved until the person chooses "Save prescription and review". Every change after that is kept in a visible change history. |
| **Appropriate reliance** | A patient's confirmation or correction is labelled as theirs and is never professional verification. If a critical field was uncertain or unreadable on the original, the prescription stays at *Needs professional review* even after the patient edits it. The app tells them to take the original and the report to a doctor or pharmacist, and says that MediSnap has contacted no one. *Professionally verified* can't be set from a patient account, and the database enforces this. |
| **Visibility of system status / closure** | A summary shows the overall status and counts (to check with a professional, not yet checked, confirmed, corrected). Save ends with links to the saved record and History. Failed saves say exactly what didn't happen ("Nothing was saved") and offer a retry. |
| **Consistency** | Corrected values flow into History, Calendar and the Doctor Report with the same status labels, while the AI's original reading is kept unchanged alongside them. |
| **Shareable evidence** | The combined PDF includes an overview with the overall status, every original page (proportions preserved), a table comparing the AI reading with the value now and each field's status, a safety summary, a mandatory disclaimer, and page numbers. |

## 11. Voice Symptom Diary: the person stays in control

| Principle | How it is applied |
|---|---|
| **User control and freedom** | Speech becomes a **draft**, never a saved entry. Nothing reaches History, Calendar or the Doctor Report until the person presses **Save Symptom Diary**. Discarding a draft or cancelling an edit asks first. |
| **AI as assistant, not decision-maker** | The AI no longer invents values. Pain, sleep and mood stay **Not set** unless the person said them, and the person must set them before saving. Times are suggested only when spoken. Emojis are offered as "Use suggestion", never applied. Fields filled from the voice carry a "From your voice, please check" tag until the person changes them. Re-organising adds suggestions without overwriting anything the person wrote. |
| **Recognition rather than recall** | The editable transcript sits above the timeline, so each entry can be checked against what was actually said. Every emoji has a spoken name, and each saved entry shows its emoji and words together. |
| **Flexibility** | Entries reorder by drag and drop with a mouse, or with **Move up / Move down** buttons for keyboard, touch and screen-reader users. Each move is announced ("Moved to position 2 of 3"). Numbers show the person's current order only. |
| **Error prevention and recovery** | Saving lists exactly what's missing ("Choose an emoji for entry 3."). Drafts survive navigation and reloads within the tab, and disappear when the tab closes so notes aren't left on a shared phone. A failed save keeps the draft. |
| **Visibility of system status** | A label always says **Draft, not saved**, **Saved**, or **Edited after saving, not saved yet**. |

## 12. Doctor Report: honest data for a clinical reader

The report has two audiences: the patient, who makes it, and a busy doctor, who reads it.

| Principle | How it is applied |
|---|---|
| **Hick-Hyman Law** | Two decisions, in order: the period (Daily, Weekly, Custom), then the output (Complete Doctor Report, Doctor Visit Report only, Prescription documents only). Weekly and Complete are preselected, so most people press one button. |
| **Error prevention** | Reversed dates, future dates and ranges over a year are caught before generating, with the reason in words. The chosen period is restated in full ("1 Nov 2026 to 7 Nov 2026 (7 days)") with how many entries and medicines it contains, so a wrong range is visible before download. "Prescription documents only" is disabled until a prescription is chosen. |
| **Visibility of system status** | The page says which prescription it is preparing ("Preparing prescription 1 of 2"), confirms the downloaded file name, and states that the PDF is made on the device and nothing is sent or saved. |
| **Recognition rather than recall** | A live preview shows exactly what the Doctor Visit Report will contain: patient, period, overview, charts, history, diary and medicines. |
| **Honest data visualisation** | Points sit on a true date axis across the period and are labelled with their values. Lines join consecutive days only, so gaps aren't presented as measurements. With fewer than three readings no trend is drawn: the readings are listed as cards with an explanation. Pain and sleep have separate charts and units. Averages need at least two readings, and "change across the period" needs two readings in each half. |
| **Appropriate reliance (medicines)** | No medicine is assumed to be current because of its date: only medicines the patient ticks "I'm taking this now" appear as current. Every medicine carries its verification status in words. Start and end dates are shown as "Not recorded" rather than guessed. |
| **Patient identity** | The report uses the profile's display name and never the email address. Without a name it says "Name not provided" and suggests adding one in Settings. |
| **Print and black-and-white** | Vector charts with labelled points, statuses in words, header and footer on every page, tables that repeat their header and never split a row, and page numbers across the whole combined PDF. |
| **Gestalt (common region, proximity)** | Overview figures sit in tiles, sections have consistent rules and headings, and the prescription appendix starts with its own cover page so the two documents stay distinct within one PDF. |

## Limits of this evidence

**What was checked, and how.** Automated browser tests ran against the production build in Microsoft Edge, with Supabase and the AI services mocked. Earlier rounds also ran the four AI features once against real Gemini.

**What wasn't done:**

- **No usability testing with real users.** Consider a short test with 3–5 people, including an older Urdu speaker, measuring task completion and the System Usability Scale.
- **No testing with real screen readers, physical phones, Safari or Firefox.**
- **No measurements on a real low-end device.** The motion figures above come from CPU throttling emulation.

**Known gaps:**

- **The AI can add details not on the label.** This applies to medicine label scans, and the interface warns about it. Prescriptions now use the no-guess, per-field status model described in section 10.
- **Image quality checks are heuristics.** Thresholds were calibrated on synthetic test images only and need tuning on real phone photos.
- **Prescription PDF text is English-only.** Urdu values can't be drawn by the PDF font and are replaced with a pointer to the original.
- **Food interaction advice isn't saved** with a medicine scan. Another existing bug.
- **Settings only cover what the account already supports:** display name, language and sign-out. There's no password reset or email change.

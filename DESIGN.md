---
name: Nexus Meet
description: On-premises meetings for one organization. A dark, dense, quiet interface where color means something is happening.
colors:
  signal-indigo: "#6366f1"
  signal-indigo-deep: "#4f46e5"
  signal-indigo-soft: "#818cf8"
  live-cyan: "#06b6d4"
  info-blue: "#3b82f6"
  alert-red: "#ef4444"
  alert-red-deep: "#dc2626"
  verified-green: "#10b981"
  caution-amber: "#f59e0b"
  deep-slate-canvas: "#0f172a"
  slate-panel: "#1e293b"
  slate-panel-raised: "#273549"
  slate-panel-high: "#334155"
  slate-line: "#334155"
  slate-line-strong: "#475569"
  ink: "#f8fafc"
  ink-muted: "#cbd5e1"
  ink-subtle: "#94a3b8"
  ink-placeholder: "#64748b"
typography:
  display:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.2em"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  body-dense:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.015em"
  pill:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "14px"
    letterSpacing: "0.03em"
rounded:
  sm: "4px"
  base: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "10": "40px"
components:
  button-primary:
    backgroundColor: "{colors.signal-indigo}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.signal-indigo-deep}"
  button-secondary:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.slate-panel-high}"
  button-danger:
    backgroundColor: "{colors.alert-red}"
    textColor: "#ffffff"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
  button-danger-hover:
    backgroundColor: "{colors.alert-red-deep}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.slate-panel}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.deep-slate-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.slate-panel}"
    rounded: "{rounded.lg}"
  modal:
    backgroundColor: "{colors.slate-panel-high}"
    rounded: "{rounded.xl}"
    padding: "24px"
    width: "min(480px, calc(100vw - 2rem))"
  nav-item:
    textColor: "{colors.ink-subtle}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  nav-item-active:
    backgroundColor: "{colors.signal-indigo}"
    textColor: "#ffffff"
  pill:
    typography: "{typography.pill}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  room-code-digit:
    backgroundColor: "{colors.deep-slate-canvas}"
    rounded: "{rounded.md}"
    width: "48px"
    height: "56px"
  call-control:
    backgroundColor: "{colors.slate-panel-high}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    size: "44px"
  call-control-active:
    backgroundColor: "{colors.signal-indigo}"
    textColor: "#ffffff"
  call-control-off:
    backgroundColor: "{colors.alert-red}"
    textColor: "#ffffff"
---

# Design System: Nexus Meet

## Overview

**Creative North Star: "The Quiet Control Room"**

Nexus Meet looks like an operations room inside the building: dark, dense and calm. Slate surfaces sit close together in tone, type is small and exact, and almost nothing on screen is colored. Color is reserved for state. Indigo marks where you are and what you can do next. Cyan marks focus and the person currently speaking. Red marks recording, being muted and anything irreversible. Green marks something that has been verified. If a screen is calm, nothing needs your attention. If something lights up, it does.

The density is deliberate. The people using it are colleagues in their own office who come back every day, not visitors who need persuading. Body text is 14px, tables use 13px, and controls are a compact 36px, so lists of people, recordings and audit entries fit on a laptop screen without scrolling. The same restraint carries the on-premises promise: nothing is decorative, nothing glows, and no surface pretends to be glass except the overlays that float above live video.

Confirmed rejections: consumer-playful styling (bubbly shapes, emoji, cartoon energy), a light theme, and gradient/glow SaaS styling (gradient heroes, neon glows, glassmorphism used everywhere).

**Key Characteristics:**
- Dark only (`color-scheme: dark`), built on Tailwind's slate ramp.
- One brand accent, indigo. Every other hue is a state.
- Dense: 14px body, 13px tables, 36px controls, a 224px sidebar that collapses to 64px.
- Flat and tonal. Depth comes from stepped slate tones and hairline borders, not shadows.
- Tabular figures wherever numbers are compared or typed (room codes, durations, sizes).

## Colors

A slate-on-slate dark palette with one indigo accent and a small set of signal hues, each with exactly one meaning.

### Primary
- **Signal Indigo** (signal-indigo): the brand and the current selection. Used for primary buttons, the active sidebar item, a pressed call control (screen share on, participants panel open) and input focus borders. Hover deepens to **Signal Indigo Deep**.
- **Signal Indigo Soft** (signal-indigo-soft): indigo as text on dark surfaces. Used for the logo mark, the newly created room code, and the text of primary-toned pills.

### Secondary
- **Live Cyan** (live-cyan): what is live or focused right now. Used for the 2px keyboard focus outline on every element, the ring around the active speaker's tile, and info-toned pills. Never used for decoration.

### Tertiary (signal hues)
- **Alert Red** (alert-red): recording in progress (with the pulsing dot), a muted mic or camera, danger buttons and error messages. Hover deepens to **Alert Red Deep**.
- **Verified Green** (verified-green): completed, verified and online. Used for the "Ready" recording pill, the presence dot on your own avatar, and the presenting icon.
- **Caution Amber** (caution-amber): in-flight states such as Requested, Starting and Stopping, plus warning notices.
- **Info Blue** (info-blue): defined but rarely used. Prefer Live Cyan for informational tone.

### Neutral
- **Deep Slate Canvas** (deep-slate-canvas): the page background, the sidebar, and the fill of inputs and room code digits. Inputs are recessed into the canvas, not raised.
- **Slate Panel** (slate-panel): cards, tables, secondary buttons and hover fills.
- **Slate Panel Raised** (slate-panel-raised): a rare intermediate step for nested rows.
- **Slate Panel High** (slate-panel-high): modals, idle call controls and the neutral pill fill. This is the highest tonal step.
- **Slate Line / Slate Line Strong** (slate-line, slate-line-strong): hairline borders. Cards and dividers use Slate Line at 60% opacity, and the strong variant marks neutral pill outlines.
- **Ink / Ink Muted / Ink Subtle** (ink, ink-muted, ink-subtle): primary text, secondary copy, and labels, metadata and idle icons.
- **Ink Placeholder** (ink-placeholder): placeholder text only.

### Named Rules
**The State-Not-Style Rule.** Every hue other than indigo means a state. A red or green element that isn't reporting recording, muting, danger, errors or verification is a bug.

**The Verified-Green Rule.** Green appears only after the system has confirmed something (for example, a recording file verified in storage). In-flight work is amber until it is done.

### Known contrast gaps (WCAG 2.2 AA is required)
- White on Signal Indigo is 4.47:1, just under 4.5:1, so solid fills with white text use Signal Indigo Deep (6.29:1) and darken to #4338ca on hover.
- White on Alert Red is 3.76:1, so solid red fills with white text use Alert Red Deep (#dc2626, 4.83:1) and darken to #b91c1c on hover. Red and indigo as text on dark pills use red-300 / indigo-300.
- Slate Line Strong is only 2.4:1 on the canvas, so input and room-code borders use `field` (#64748b, 3.75:1) to meet 1.4.11.
- Ink Placeholder on the canvas is 3.75:1. Placeholders must never be the only label.

Ink Subtle passes on both the canvas (6.96:1) and Slate Panel (5.71:1). Live Cyan on the canvas is 7.35:1.

## Typography

**Body Font:** Inter Variable (with ui-sans-serif, system-ui, sans-serif)

**Character:** a single neutral grotesque, used small and exact. Hierarchy comes from weight and slight negative tracking on headings, not from big size jumps.

### Hierarchy
- **Display** (700, 40px, line-height 1, tracking 0.2em, tabular): reserved for a room code shown on its own, in Signal Indigo Soft. Nothing else is this large.
- **Headline** (600, 28px/36px, -0.02em): page titles in the page header.
- **Title** (600, 20px/28px, -0.015em): modal and section titles. The pre-join meeting title uses a 22px/30px variant.
- **Body** (400, 14px/22px): the default for all copy and controls. Set on `body`.
- **Body Dense** (400–500, 13px): tables, small buttons, call controls, errors and secondary metadata. This is the most used size in the app.
- **Label** (500, 12px, +0.015em): form labels in Ink Subtle. The uppercase variant is used for table headers.
- **Pill** (600, 11px/14px, +0.03em, uppercase): status pills only.
- **Also in code, outside the scale:** 10px for the notification count badge, 15px for large (lg) buttons, 22px for the pre-join title.

### Named Rules
**The Tabular Figures Rule.** Room codes, durations, file sizes, timestamps and counts use `tnum`, so digits line up and don't shift as they change.

**The Thai Headroom Rule.** User content (names, departments, meeting titles) may already be in Thai, and a Thai UI is planned. Never clamp text to a fixed height tuned for Latin text. Truncate with an ellipsis and keep the full value available (via `title` or a detail view). Inter has no Thai glyphs, so the fallback stack renders Thai until a Thai face is added.

## Layout

The app shell is a sticky, full-height sidebar (224px open, 64px collapsed, remembered per browser) plus a main column with 24px horizontal padding (40px at `lg`) and 32px vertical padding. Content is capped at 1152px (`max-w-6xl`) and centered. Layouts are desktop only: the target is laptop Chrome/Edge, with no mobile or tablet breakpoints.

The meeting room drops the shell and fills the viewport: a 56px header bar, the video stage, an optional participants panel on the right, and an 80px footer holding the floating control bar.

Spacing follows a 4px grid. The common steps are 8px between controls, 12px between list rows and icon-to-text, 16px between form fields and 20px inside card sections. A page header sits 24px above its content.

## Elevation & Depth

Flat and tonal. Surfaces step up in tone (canvas, panel, panel raised, panel high), and hairline Slate Line borders separate them. Nothing at rest casts a shadow. A single shadow is reserved for elements that float above other content: modals, toasts and the meeting control bar. Glass (85% Slate Panel with a 12px backdrop blur) is used only where UI floats over live video, such as the participant name badges and the control bar.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4), 0 10px 24px -3px rgba(15,23,42,0.7)`): modals, toasts and the meeting control bar. Nothing else uses it.

### Named Rules
**The Flat-At-Rest Rule.** Cards, tables and the sidebar never cast shadows. If something needs separating, step its tone or add a hairline.

**The Glass-Over-Video Rule.** Backdrop blur exists only to keep text readable over moving video. It is never used on static pages.

## Shapes

Modest corners on working controls and softer corners on containers. Buttons, inputs, selects, error notices and the name badges over video use 8px (`rounded`, which is `--radius`). Nav items, the call-control group, room code digits and video tiles use 12px. Cards use 16px and modals 24px. The 4px step exists in the scale but is barely used. Pills, avatars and the round call controls are fully round. Borders are always 1px hairlines, so emphasis comes from color, never from thicker strokes. The one exception is the 2px focus outline and the speaking ring.

## Components

### Buttons
Precise and unhurried: compact, softly squared, and on hover only the color changes. There is no lift and no bounce.
- **Shape:** gently rounded (8px).
- **Sizes:** sm 32px (13px text), md 36px (default), lg 44px (15px text). Icon and label are separated by an 8px gap. A loading state swaps the icon for a spinner and disables the button.
- **Primary:** Signal Indigo Deep with white medium text (plain Signal Indigo fails AA with white). Hover is #4338ca.
- **Secondary:** Slate Panel with a hairline border. Hover is Slate Panel High.
- **Danger:** Alert Red Deep with semibold white text. Used only for irreversible or meeting-ending actions, always behind a confirmation modal that states the consequence.
- **Ghost:** Ink Muted text with no fill. Hover adds a Slate Panel fill and Ink text.
- **Disabled:** 50% opacity and a not-allowed cursor.

### Pills
- **Style:** fully round, 1px border tinted to the tone, a 10–15% fill of the same hue, and 11px uppercase semibold text.
- **Tones:** neutral, success, danger, warning, info (cyan) and primary. Recording status maps strictly: Requested, Starting and Stopping are amber, Recording is red with a pulsing dot, Finalizing is cyan, Ready is green and Failed is red.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Slate Panel.
- **Shadow Strategy:** none (see Flat-At-Rest).
- **Border:** a hairline Slate Line at 60% opacity.
- **Internal Padding:** 20px. Rows inside cards use 20px horizontal and 12px vertical padding.

### Inputs / Fields
- **Style:** recessed. Canvas fill, hairline `field` border (#64748b), 8px corners, 36px tall, Ink Placeholder hint text. Labels sit 6px above in the 12px Label style.
- **Focus:** the border turns Signal Indigo. The inputs set `focus:outline-none`, so the global cyan outline does not show on them; the border change is the only focus indicator.
- **Error:** an inline alert below the field with a Red 10% fill, Red 40% border and 13px text.

### Navigation
- **Sidebar:** canvas background, separated from content by a hairline. Items are 44px tall with 12px corners, an icon plus 14px label, and Ink Subtle at rest. Hover adds a Slate Panel fill and Ink text. The active item is solid Signal Indigo with white text. Collapsed, the sidebar shows icons only, with labels in `title` and `aria-label`. The notification bell, profile (avatar with a green presence dot) and sign out sit at the bottom.

### Modal
Native `<dialog>`, 480px wide, Slate Panel High fill with a hairline border, 24px corners, the Float shadow and a 60% black backdrop. Title is in the Title style with a close button at the top right. Actions are right-aligned in the footer, and the destructive action comes last.

### Room Code (signature)
The product's most recognizable element. To enter one there are four separate digit boxes (48×56px, 12px corners, recessed canvas fill, 24px semibold tabular digits). Focus moves forward automatically, and pasting fills all four boxes. A newly created code is shown in the Display style (40px bold, 0.2em tracking, Signal Indigo Soft) so it can be read aloud across a room.

### Meeting Control Bar (signature)
A glass group with the Float shadow, centered in the meeting footer and holding 44px round controls. Idle controls are Slate Panel High. A control that is on, such as screen share or the participants panel, is solid Signal Indigo. A mic or camera that is off is solid Alert Red, so being muted can be seen at a glance. Leave (secondary) and End meeting (danger, host only) sit outside the group.

### Participant Tile
Video in a 12px-corner tile on a Slate Panel fill. When there is no video, the tile shows a 96px initials avatar. The active speaker gets a 2px Live Cyan ring. A shared screen uses `object-contain` on black with a hairline border. A glass name badge sits at the bottom left with a red mic-off icon when that person is muted. Your own camera is mirrored.

## Do's and Don'ts

### Do:
- **Do** keep every hue other than indigo tied to a state: cyan for focus or speaking, red for recording, muted or danger, amber for in-flight, green for verified.
- **Do** use the Tailwind tokens from `apps/web/src/app/globals.css` (`bg-surface`, `text-fg-subtle`, `border-line/60`) and the shared `Button`, `Input`, `Card`, `Pill`, `Modal` and `PageHeader` components from `components/ui.tsx` and `components/modal.tsx`.
- **Do** step surfaces by tone (canvas, panel, panel high) and separate them with hairlines at 60% opacity.
- **Do** use tabular figures for room codes, times, durations and sizes.
- **Do** put destructive actions behind a modal whose body states exactly what will happen, for example "All participants will be disconnected… room code 4821 will stop working."
- **Do** use Signal Indigo Deep or Alert Red Deep behind white text where AA contrast matters.
- **Do** leave room for Thai: truncate with an ellipsis and a `title`, never with a fixed height.

### Don't:
- **Don't** add a light theme. The product is dark only.
- **Don't** use gradients, neon glows, or glass outside the video overlays.
- **Don't** drift into consumer-playful styling: no bubbly radii on working controls, no emoji in the UI, no cartoon illustration.
- **Don't** cast shadows from cards, tables or the sidebar. The Float shadow belongs only to modals, toasts and the meeting control bar.
- **Don't** introduce a second brand hue. The mockup palette in `UXUI/nexus_enterprise/DESIGN.md` (#0b1326, #c0c1ff and so on) is not what shipped. This file and `globals.css` are authoritative.
- **Don't** show green for anything that hasn't been verified.
- **Don't** rely on a placeholder as the only label.

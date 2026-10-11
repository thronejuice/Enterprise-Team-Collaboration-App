---
name: Nexus Enterprise
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#adc6ff'
  on-tertiary: '#002e6a'
  tertiary-container: '#4d8eff'
  on-tertiary-container: '#00285d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.015em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  code-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style
The brand voice is authoritative, deeply focused, and seamlessly efficient. Engineered for enterprise workforces, cross-functional engineering pods, and executive operations, the interface projects quiet precision and zero-friction communication. The aesthetic minimizes cognitive friction during high-stress operational incidents, multi-stream video conferences, and dense multi-threaded messaging.

This design system blends **Corporate Modern** rigor with **Tactile Dark Glass** subtleties. It rejects whimsical gradients and oversized novelty radiuses in favor of deep structural clarity, razor-sharp information scent, and high-performance density. Surfaces feel like finely calibrated avionics displays: cool slate underpinnings, high-legibility typographic hierarchies, disciplined status indicators, and subtle translucent framing that organizes intense streams of information into clear, actionable layers.

## Colors
The palette utilizes deep, pigment-rich slate and charcoal tones rather than absolute blacks, preventing harsh optical vibration across 10-hour workdays. Accent colors are reserved strictly for intent, attention, and systemic state transitions.

- **Canvas & Surface Architecture**:
  - Root App Background (`#0F172A`): Deep slate canvas providing the baseline contrast plane.
  - Primary Surface Layer (`#1E293B`): Active card panels, rail sidebars, channel trees, and message containers.
  - Elevated Popovers & Modals (`#334155`): Hover surfaces, tooltips, flyout menus, and active meeting controls.
  - Structural Dividing Lines (`#334155` at resting, `#475569` on interactive state / focus).
- **Interactive Accents**:
  - Primary Indigo (`#6366F1`): Primary actions, mention notifications, unread badges, and key selection rings.
  - System Tertiary Blue (`#3B82F6`): Hyperlinks, information callouts, and secondary action highlights.
  - System Cyan (`#06B6D4`): Active audio visualizers, screen-sharing bounding borders, and real-time thread highlights.
- **Functional Telemetry & Status**:
  - Recording & Critical Alert (`#EF4444`): Active meeting recording pulse, mute warning banners, and error validation.
  - Active Presence & Transmission (`#10B981`): Online indicator, low-latency stream status, and live screen broadcasts.
  - Idle / Away (`#F59E0B`): Yellow amber for inactive presence or pending network reconnect.

## Typography
Typographic scale and letterforms rely strictly on Inter, leveraging its tabular number alternates (`tnum`) and tall x-height for data-dense chat threads, timestamps, and active participant metrics.

- **Headlines**: Weighted at semi-bold (`600`) and bold (`700`) with snug, negative tracking to anchor modal headers, channel titles, and call stage metadata.
- **Body**: Regular weight (`400`) calibrated for prolonged reading in low-light environments. Chat streams prioritize `body-md` (14px/22px) for a balance between line scan efficiency and vertical density.
- **Labels & Microcopy**: Medium (`500`) and semi-bold (`600`) with proportional letter-spacing to ensure absolute clarity on status badges, presence indicators, timestamps, and audio volume meters.
- **Tabular Figures**: Numeric outputs—such as call durations, participant counters, and unread badges—must enforce `font-feature-settings: "tnum" 1` to prevent layout shift during state changes.

## Layout & Spacing
The layout model employs a responsive multi-pane fluid architecture engineered for multi-tasking workflows. 

- **Panels & Canvases**:
  - Primary Rail: Compact navigation bar fixed at 64px width.
  - Channel / Directory Panel: Collapsible left sidebar between 240px and 320px.
  - Workspace Canvas: Fluid central region accommodating thread message streams or video stage grids.
  - Inspector / Thread Panel: Right-aligned contextual drawer spanning 360px to 440px or collapsing off-screen.
- **Responsive Adaptations**:
  - **Desktop (>= 1200px)**: 3-pane concurrent view (navigation rail + channel tree + message view + thread drawer) with `gutter-desktop` (24px) between major analytical blocks.
  - **Tablet (768px – 1199px)**: Dual-pane layout. Navigation rail collapses to an icon bar; sidebars become overlay drawers triggered via top app bars.
  - **Mobile (< 768px)**: Single-pane stack navigation with bottom-anchored action bars. Margins reduce to `margin` (16px), and conversation items maintain an internal vertical cadence using `space-sm` (8px).

## Elevation & Depth
Elevation is achieved using tonal stacking, low-contrast borders, and deep ambient occlusions instead of high-spread diffused shadows. 

- **Tonal Hierarchy**:
  - Base Plane (`#0F172A`): Root window frame and workspace backdrop.
  - Layer 1 (`#1E293B`): Fixed cards, message list canvas, and pinned sidebars.
  - Layer 2 (`#273549`): Hovered chat items, nested quote cards, and collapsed thread boxes.
  - Layer 3 (`#334155`): Flyout menus, call overlay toolbars, contextual action bars, and modal dialogue boxes.
- **Borders & Seams**:
  - Standard structural separation uses a 1px border colored with `#334155` at 60% opacity.
  - Active elements or hovered cards brighten the border to `#475569` at 100% opacity.
- **Ambient Shadow System**:
  - Floating panels and detached video stage HUDs employ a multi-layered shadow: `0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 10px 24px -3px rgba(15, 23, 42, 0.7)`.
- **Glass Accents**:
  - Video conference floating docks and in-call control bars incorporate backdrop blur (`backdrop-filter: blur(12px)`) overlaid on `#1E293B` at 85% opacity, establishing depth over active participant video grids.

## Shapes
The design system operates at `roundedness: 2`, delivering balanced rounded geometry (`0.5rem` / 8px baseline) that preserves enterprise precision while eliminating harsh corners.

- **Small Interactive Units (Buttons, Input Fields, Badges)**: Bound to `0.5rem` (8px) corner radius.
- **Card Containers & Message Groups (`rounded-lg`)**: Bound to `1rem` (16px) corner radius for message bubbles, video tile containers, and channel header modules.
- **Elevated Modals & Meeting Windows (`rounded-xl`)**: Scaled to `1.5rem` (24px) corner radius.
- **Pill Exceptions**: Micro status badges (such as "REC" alerts, online presence indicators, and numeric notification counters) utilize full pill borders (`9999px`) to distinguish categorical tags from structural containers.

## Components

- **Buttons**:
  - *Primary*: Solid `#6366F1` background, white text, 8px radius, 36px standard height (`space-md` horizontal padding). Transitions to `#4F46E5` on hover. Focus rings use 2px solid `#06B6D4` with 2px offset.
  - *Secondary / Surface*: `#1E293B` surface with 1px `#334155` border, text `#F8FAFC`. Hovers shift surface to `#334155`.
  - *Destructive / End Call*: Background `#EF4444`, hover `#DC2626`, bold contrasting white typography.
  - *Meeting Floating Controls*: Circular (44px × 44px) or rounded 12px pill blocks in semi-translucent `#1E293B` with backdrop blur.

- **Input Fields & Search**:
  - Text inputs and message composers rest on `#0F172A` inset backgrounds surrounded by a 1px `#334155` border.
  - Active focus transitions the border to `#6366F1` without adding outer layout-shifting strokes. Placeholder text sits at `#64748B`.
  - Message editor bar includes embedded action chips (attachments, code snippets, emojis) separated by subtle `#334155` vertical dividers.

- **Chips & Status Tags**:
  - Presence: 8px circular indicator featuring `#10B981` (Online), `#F59E0B` (Away), or `#EF4444` (Do Not Disturb/In Meeting), ringed with a 2px `#1E293B` mask to separate cleanly from avatars.
  - Recording Pill: `#EF4444` background at 15% opacity, 1px border `#EF4444`, paired with a pulsing 6px `#EF4444` dot and `label-sm` font.
  - Mention Chip: Background `#6366F1` at 20% opacity, font color `#818CF8`, 4px radius, padded with 2px vertical / 6px horizontal.

- **Lists & Message Feeds**:
  - Message rows reside on transparent backdrops, transitioning seamlessly to `#1E293B` on hover with a 4px corner radius.
  - Left gutters reserve 40px for user avatars. Consecutive messages from the same sender collapse avatar space into a subtle timestamp visible on hover.
  - Hovering a message exposes a floating quick-reaction bar elevated on Layer 3 (`#334155`) with 6px border radiuses.

- **Checkboxes & Radios**:
  - Custom 16px × 16px boxes with 4px radius (checkbox) or circular (radio).
  - Unchecked: `#0F172A` background, 1px `#475569` border.
  - Checked: Solid `#6366F1` with crisp white vector checkmark.

- **Cards & Video Tiles**:
  - Video Grid Tiles: Enclosed in `#1E293B` containers, 12px radius, with an absolute bottom-left label badge for participant name and mic status. Active speaker receives an immediate 2px stroke of `#06B6D4`.
  - Screen Share Stream: Centered Stage card with 1px border `#334155` and pinned cyan header metadata bar showing broadcast latency and resolution.
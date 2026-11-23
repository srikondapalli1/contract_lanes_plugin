---
name: Lanes
description: A metro map of a hackathon repo, with the signalling that closes a broken interchange before a merge runs through it.
colors:
  paper: "#f5f6f3"
  paper-2: "#eceee9"
  station-white: "#ffffff"
  ink: "#15181b"
  ink-2: "#3f454c"
  rule: "#d3d7d1"
  world: "#ec6a1c"
  brain: "#1f4fd1"
  crowd: "#12945a"
  crowd-ink: "#0b6b40"
  signal: "#d0242b"
  signal-ink: "#a3161c"
  suspended-wash: "#fff6f5"
  term-text: "#e8ebe7"
  term-dim: "#9aa29c"
  term-pass: "#7fdcaa"
  term-fail: "#ff8f8a"
  term-prompt: "#8fb4ff"
  term-mark: "rgba(255, 196, 61, 0.2)"
typography:
  display:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.3rem, 3.9vw, 3.5rem)"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3rem)"
    fontWeight: 850
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.3
  lede:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.55
  status:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 800
    lineHeight: 1.55
  figure:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 800
    lineHeight: 1.55
    fontFeature: "\"tnum\" 1"
  button:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1
  badge:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0em"
  map-label:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 800
    letterSpacing: "-0.01em"
  map-label-small:
    fontFamily: "Overpass, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  code:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "\"tnum\" 1"
  code-time:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.9
    fontFeature: "\"tnum\" 1"
  code-note:
    fontFamily: "Overpass Mono, ui-monospace, monospace"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  buffer: "2px"
  focus: "4px"
  panel: "6px"
  code-sm: "10px"
  code: "12px"
  notice: "14px"
  interchange: "17px"
  pill: "999px"
  circle: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  cell: "20px"
  gutter: "24px"
  column: "32px"
  column-wide: "40px"
  lede: "44px"
  band-narrow: "72px"
  band: "112px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0.7em 1.15em"
  button-primary-hover:
    backgroundColor: "{colors.brain}"
    textColor: "{colors.paper}"
  button-primary-done:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "0.7em 1.15em"
  button-ghost-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-notice:
    padding: "0.5em 0.95em"
    rounded: "{rounded.pill}"
  nav-link:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "6px 0"
  nav-link-hover:
    textColor: "{colors.ink}"
  line-badge-world:
    backgroundColor: "{colors.world}"
    textColor: "{colors.ink}"
    typography: "{typography.badge}"
    rounded: "{rounded.circle}"
    size: "1.6em"
  line-badge-brain:
    backgroundColor: "{colors.brain}"
    textColor: "{colors.station-white}"
    typography: "{typography.badge}"
    rounded: "{rounded.circle}"
    size: "1.6em"
  line-badge-crowd:
    backgroundColor: "{colors.crowd-ink}"
    textColor: "{colors.station-white}"
    typography: "{typography.badge}"
    rounded: "{rounded.circle}"
    size: "1.6em"
  map-line-world:
    backgroundColor: "{colors.world}"
    height: "15px"
    rounded: "{rounded.pill}"
  map-line-brain:
    backgroundColor: "{colors.brain}"
    height: "15px"
    rounded: "{rounded.pill}"
  map-line-crowd:
    backgroundColor: "{colors.crowd}"
    height: "15px"
    rounded: "{rounded.pill}"
  interchange:
    backgroundColor: "{colors.station-white}"
    rounded: "{rounded.interchange}"
    width: "34px"
    height: "56px"
  interchange-label:
    textColor: "{colors.ink}"
    typography: "{typography.map-label}"
  interchange-label-closed:
    textColor: "{colors.signal-ink}"
    typography: "{typography.map-label}"
  legend-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "30px 32px 26px"
    width: "560px"
  ticket:
    backgroundColor: "{colors.station-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  ticket-prompt:
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    padding: "12px 18px"
  status-board:
    backgroundColor: "{colors.station-white}"
    rounded: "{rounded.panel}"
  status-board-head:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink-2}"
    padding: "14px 20px"
  status-board-cell:
    padding: "18px 20px"
  status-board-row-suspended:
    backgroundColor: "{colors.suspended-wash}"
  status-good:
    textColor: "{colors.ink}"
    typography: "{typography.status}"
  status-suspended:
    textColor: "{colors.signal-ink}"
    typography: "{typography.status}"
  service-notice:
    backgroundColor: "{colors.station-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.notice}"
    padding: "14px 16px"
    width: "326px"
  service-notice-state-suspended:
    textColor: "{colors.signal-ink}"
    typography: "{typography.status}"
  service-notice-state-good:
    textColor: "{colors.ink}"
    typography: "{typography.status}"
  code-panel:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.term-text}"
    typography: "{typography.code}"
    rounded: "{rounded.code}"
    padding: "18px 20px"
  code-panel-step:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.term-text}"
    typography: "{typography.code}"
    rounded: "{rounded.code-sm}"
    padding: "12px 14px"
  station-track:
    backgroundColor: "{colors.rule}"
    height: "6px"
    rounded: "{rounded.pill}"
  station:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.circle}"
    size: "14px"
  station-lit:
    backgroundColor: "{colors.station-white}"
    rounded: "{rounded.circle}"
    size: "20px"
  timetable-line:
    backgroundColor: "{colors.brain}"
    width: "15px"
    rounded: "{rounded.pill}"
  timetable-stop:
    backgroundColor: "{colors.station-white}"
    rounded: "{rounded.circle}"
    size: "30px"
  timetable-time:
    textColor: "{colors.ink-2}"
    typography: "{typography.code-time}"
  terminus-bar:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.buffer}"
    width: "34px"
    height: "8px"
  frame:
    backgroundColor: "{colors.station-white}"
    rounded: "{rounded.panel}"
  frame-caption:
    textColor: "{colors.ink-2}"
    padding: "12px 16px"
  play-disc:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.circle}"
    size: "84px"
---

# Design System: Lanes

## Overview

**Creative North Star: "The Signalled Network Map"**

Lanes is drawn as the network map of one hackathon repo. Each lane is a line in its own committed colour. Each contract is an interchange where lines meet. Lanes itself is the signalling: when a contract breaks, its interchange closes with a red bar and a service notice that gives the real reason. Everything else on the sheet is white map paper and heavy ink, set in one typeface family. Rigour comes from the map's discipline: fixed angles, round caps, and words for every status.

Density is that of a printed transit sheet. A few heavy elements sit on a lot of quiet paper, outlined panels lie flat on it, and only the service notice is pinned on top. Motion is the map's own: the lines draw in once along their paths, the notice flips when the fix lands, and nothing else moves unless someone asks. The world refuses the category default of a dark terminal hero over a grid of feature cards. Terminal output appears only as a record inside a board row or a step, never as a surface in its own right.

The same tokens drive the public site (`site/index.html`, the authority) and the demo video's cards. The live `lanes graph` tool page (`packages/core/web/graph.html`) is a separate operational surface with its own system and is outside this world.

**Key Characteristics:**
- Map paper and ink, with three line colours at full saturation, one per lane.
- Lines are 15px thick, round-capped, and run at 0°, 45° or 90° only.
- Interchanges are white capsules with heavy ink outlines. A closed one takes a signal-red ring and a diagonal bar.
- Status is a word plus a glyph ("Good service", "Suspended"), never colour alone.
- Overpass carries everything a person reads. Overpass Mono is for code, commands and machine output.
- Flat paper: 2px ink outlines and 1px rules separate things. The pinned notice is the one shadow.

## Colors

White map paper and near-black ink carry the structure. Three saturated line colours belong to the three lanes, and signal red is held back for a closed interchange.

### Primary
The line colours. Each one is a lane's identity, used in that lane's map line, its key swatch and its badge.
- **Line Orange, lane world** (#ec6a1c): the world line, its key swatch and the W badge. Ink text sits on it (5.6:1). White text on orange fails, so it is never used.
- **Line Cobalt, lane brain** (#1f4fd1): the brain line, the B badge, and the timetable line (the run on GitHub is brain's fix). Cobalt also has one non-lane job, interaction: the 3px focus ring, the primary button's hover fill, text selection and the caret.
- **Line Green, lane crowd** (#12945a): the crowd line and its key swatch only. White on it is 3.9:1, too low for a badge letter.
- **Deep Line Green** (#0b6b40): the C badge fill, which carries a white letter (6.6:1). It is the crowd colour made safe for text, not a fourth line.

### Secondary
Signalling. It is reserved for a suspended interchange and the record of the failing contract.
- **Signal Red** (#d0242b): the closed interchange's ring, the 6px closing bar, and the suspended notice's 2px border. It is for strokes only.
- **Signal Ink** (#a3161c): text and glyphs for a suspended state, such as the "Suspended" status word and disc, the closed interchange's label and the in-map suspended tag (7.8:1 on white).
- **Suspended Wash** (#fff6f5): the background of the suspended row on the status board and of its check-output row beneath. It is the only tinted surface.

### Tertiary
The terminal palette appears only inside an ink code panel, to colour real `lanes check` output. Every coloured token there is also a word ("pass", "fail", "$").
- **Terminal Text** (#e8ebe7): output text on ink (14.8:1).
- **Terminal Dim** (#9aa29c): headers and field names such as `seed:` and `repro:` (6.8:1).
- **Terminal Pass** (#7fdcaa): the word `pass`.
- **Terminal Fail** (#ff8f8a): the word `fail` and the failing rule's tag, in bold.
- **Terminal Prompt** (#8fb4ff): the `$` prompt.
- **Counterexample Mark** (rgba(255, 196, 61, 0.2)): a translucent highlight behind the shrunk counterexample line. Inside the mark, dim text lifts to #c9cfca.

### Neutral
- **Map Paper** (#f5f6f3): the page and the legend panel. Faintly warm, never pure white, so white objects read as placed on it.
- **Paper Shade** (#eceee9): the status board's header band and the scrollbar track.
- **Station White** (#ffffff): every object set on the map, including interchange fills, lit stations, timetable stops, the ticket, the board, the notice and media frames.
- **Ink** (#15181b): text, every structural outline, the primary button, code panel fills and the terminus bar (16.4:1 on paper).
- **Ink Two** (#3f454c): secondary text, ledes, captions, labels and times (8.9:1 on paper).
- **Map Rule** (#d3d7d1): 1px hairlines, the ticket's dashed tear line, the station track and unlit stations. It is decorative only (1.3:1) and never carries meaning alone.

### Named Rules
**The Line Colour Rule.** Orange, cobalt and green mean world, brain and crowd. Cobalt's one other job is interaction (focus ring, primary hover, selection, caret). Line colours are never used for headings, emphasis, links at rest, backgrounds, or to highlight a winner.

**The Good Service Is Ink Rule.** Green is crowd's line, so "good" is never green. Good service, a reopened interchange and `main · green` are all drawn in ink.

**The Signal Rule.** Signal red appears only where a contract is suspended: the ring, the bar, the notice border and the suspended words. A red stroke anywhere else means something is closed.

## Typography

**Display Font:** Overpass (with Segoe UI, system-ui, sans-serif), self-hosted variable woff2, weights 100–900
**Body Font:** Overpass
**Label/Mono Font:** Overpass Mono (with ui-monospace, monospace), self-hosted, weights 300–700

**Character:** Overpass is signage type in the Highway Gothic line. Set heavy and tight it reads like station names on a map, and at body sizes it stays plain and open. Overpass Mono is its own monospaced sibling, so terminal output and prose read as one voice.

### Hierarchy
- **Display** (850, clamp(2.3rem, 3.9vw, 3.5rem), line-height 1, -0.03em, balanced wrap): the one headline in the legend panel. Emphasis inside it is upright and ink (`em` with no italic and no colour).
- **Headline** (850, clamp(2rem, 3.4vw, 3rem), 1.02, -0.025em, max 22ch): section headings, written as sentences.
- **Title** (800, 1.25rem, 1.3): timetable stops and step headings (1.2rem). Contract names on the status board use 800 at 1.15rem.
- **Lede** (400, 1.2rem, 1.55, Ink Two, max 64ch): the paragraph under a section heading.
- **Body** (400, 1.125rem, 1.55): running text. Paragraphs cap at 60–72ch.
- **Label** (600–700, 0.85–0.98rem, sentence case, normal tracking): nav links, map key, board column heads (700, 0.85rem) and captions (0.95rem).
- **Status** (800, 1.15rem in the notice, 1.05rem on the board): the status words.
- **Figure** (800, 1.35rem, tabular figures): tallies such as "19 of 19" and "43 ms". Figures are Overpass, not mono.
- **Map labels** (800, 23px, -0.01em, and a 600 16px secondary route line in Ink Two, both in SVG units): interchange names on the map.
- **Badge** (800, 0.8rem, line-height 1): the single letter in a line badge.
- **Code** (Overpass Mono 400, 0.82–0.84rem, 1.55–1.6, tabular): the setup prompt, commands and check output.
- **Code time** (Overpass Mono 600, 1rem, 1.9, Ink Two, right-aligned): timetable clock times.
- **Code note** (Overpass Mono 500, 0.8rem, 1.45, Ink Two): the notice's machine line, "1 spooked agent · seed 42".

### Named Rules
**The Mono Is Machine Rule.** Overpass Mono is only for what a machine wrote or will read: code, commands, check output, and the facts lifted from it (seed, counterexample, branch name, run timestamps). Prose, headings, labels and tallies are always Overpass.

**The Sentence Case Rule.** Nothing is uppercased or letter-spaced out. Headings start their section directly, with no kicker or eyebrow above them. Labels are short words in sentence case, like column heads on a timetable.

## Layout

The page is a stack of full-width bands inside a centred 1240px container with a 24px side gutter (`min(1240px, 100% - 48px)`). A sticky 64px station index sits on top, on paper at 92% with a 10px backdrop blur and a 1px rule below. Bands are separated by 1px rules and padded 112px top and bottom (72px at 860px and below). A section heading sits 16px above its lede, and the lede sits 44px above the content.

The first viewport is a full-bleed SVG map, `clamp(720px, 100svh - 64px, 880px)` tall, with a 1440×860 viewBox sliced from the right edge (xMaxYMid slice) so the interchanges stay in view. The legend panel floats over the left of the map, centred vertically, aligned to the container edge at `max(24px, (100vw - 1240px) / 2)`, and is `min(560px, 100% - 48px)` wide. The service notice is pinned under the closed interchange inside the SVG.

Content grids: the inspection rows use a 220px name column, the track, and a 190px tally column with 24px gaps. The timetable is a 90px time column, a 44px stop column and the text, with its line at 105px. The map and video pair use two equal columns with a 40px gap. The ticket section is 1.35fr against 1fr with a 32px gap. Board cells are padded 18px by 20px.

Responsive behaviour:
- **960px and below:** the media pair and the ticket section drop to one column.
- **860px and below:** the station index keeps only the mark and GitHub. The hero restacks: the map comes first, cropped to the three interchanges (viewBox 740 355 700 175, meet). Secondary map labels and the in-map notice hide, and a compact tag ("Suspended: holdMs 1800 > 1500") appears under the closed interchange. The legend becomes an in-flow block with 16px margins and 24px/20px/20px padding. The notice moves below it with 16px margins. The ticket swaps its two plugin command lines for a one-line pointer to the install steps. Inspection rows stack name, track and tally, and stations shrink (9px and 14px, rings 2px and 3.5px, run 9px). The check output scrolls sideways instead of wrapping.
- **720px and below:** the status board's Route column is hidden with `visibility` and kept at zero width, so Contract and Service split 50/50. Cells pad 14px and status words don't wrap. The timetable tightens to a 62px time column, its line moves to 77px, and times drop to 0.85rem.
- The setup prompt keeps each `--flag` on one line (no-wrap spans) and allows breaks after slashes in long paths. No horizontal page scroll at 390px.

## Elevation & Depth

The map is flat paper. Panels lie on it, defined by 2px ink outlines and separated inside by 1px rules, with no shadows and no tonal stacking beyond Paper Shade on the board's header. The one lifted object is the service notice, pinned to the closed interchange like a card on a station map, with a soft drop beneath it. Focus shows as a 3px cobalt outline at a 3px offset with 4px corners, not as a glow.

### Shadow Vocabulary
- **Pinned notice** (`box-shadow: 0 14px 30px -18px rgba(21, 24, 27, .5)`): the service notice only.

### Named Rules
**The Pinned Notice Rule.** Only the service notice casts a shadow. Every other panel stays flat on the paper, outlined in ink.

## Shapes

The form language comes from the map. Lines have round caps and round joins and bend only at 45°. Anything that stands for a line or a route has fully round ends: map lines (15px), key swatches (26×7px), the station track (6px base, 12px run), the timetable line (15px with 8px radius) and the closing bar. The terminus bar is deliberately square-ended (34×8px, 2px corners), a buffer stop at the end of the line.

Circles are stations and signs: line badges (1.6em), timetable stops (30px with a 6px ink ring), stations on the track (14px unlit, 20px lit with a 4.5px ink ring), and the 84px paper play disc with a 3px ink ring. The interchange is a vertical capsule (34×56px, 17px radius) that spans the parallel lines it joins.

Panels (legend, ticket, status board, media frames) have quietly squared 6px corners and 2px ink outlines. Code panels are softer (12px for check output, 10px for step commands). The pinned notice is the softest panel at 14px, and its flip animation clips to that radius. Buttons are full pills (999px) with a 2px border.

Line weights: map lines and the timetable line 15px; interchange outlines, the closing bar and timetable stop rings 6px; panel outlines 2px; the ticket tear line 2px dashed in Map Rule; hairlines 1px.

### Named Rules
**The 45° Rule.** Map lines run horizontal, vertical or at 45°, with round caps and round joins. A line that bends at any other angle is not on this map.

## Components

### Buttons
Plain, heavy pills that read like platform signs.
- **Shape:** full pill (999px) with a 2px border in the fill colour, 0.55em gap between icon and label, 1.05em inline SVG icon.
- **Primary:** ink fill, paper text, Overpass 700 at 1rem, padding 0.7em 1.15em. This is the Copy button on the setup ticket, the page's primary action.
- **Hover / Focus / Active:** hover fills cobalt (fill and border) over 0.25s on the house ease. Focus is the 3px cobalt ring at a 3px offset. Active drops 1px.
- **Done (copied):** the label reads "Copied" (or "Selected: press Ctrl+C" when the clipboard is blocked), the icon swaps to a check, and the fill turns Ink Two. It resets after 2.2s.
- **Ghost:** transparent with an ink border and ink text. Hover fills ink with paper text. Used for "Source on GitHub" and the notice's "Undo".
- **Notice size:** padding 0.5em 0.95em at 0.9rem, inside the service notice.

### Navigation (the station index)
- **Style:** a sticky 64px bar. The mark (two round-capped lines, orange and cobalt, meeting at a small white ink-ringed capsule) sits beside "Lanes" in 800 at 1.3rem. Five section links follow, named as stations: Status, Inspection, Timetable, Map, Ticket. Then GitHub in 700.
- **States:** links are 600 at 0.98rem in Ink Two. Hover turns them ink with a 2px ink underline bar (0.2s).
- **Mobile:** at 860px and below the section links hide, leaving the mark and GitHub.

### Map lines and interchanges (signature)
- **Lines:** SVG paths, 15px stroke, round caps and joins, each in its lane's colour, entering from the sheet's edges and bending only at 45°.
- **Interchange capsule:** a station-white 34×56px capsule (17px radius) with a 6px ink outline, labelled above in map-label type with its route underneath ("world → brain").
- **Closed state:** the outline turns signal red, a 6px signal-red round-capped bar crosses the capsule on a diagonal, and the label turns Signal Ink. Reopening returns the ring and label to ink and fades the bar out (0.4s). On phones a white tag with a 3px signal border carries the same state in words.
- **Line badges on the map:** 17px-radius circles at each line's terminus, with the lane's letter.
- **Draw-in:** each line draws once along its path (1.6s, staggered 0s, 0.15s and 0.3s). It is skipped under reduced motion and for automated captures, which see the settled map.

### Line badges
- **Style:** a circle 1.6em across, one capital letter in Overpass 800 at 0.8rem. W is ink on Line Orange, B is white on Line Cobalt, and C is white on Deep Line Green.
- **Use:** wherever a lane is named in a route (the status board's Route column, with a 18px SVG arrow between badges), always followed by the route in words.

### Legend panel
- **Style:** the map's legend box, on paper with a 2px ink outline and 6px corners, padded 30px 32px 26px. It holds the display headline, a one-line offer in Ink Two (max 52ch), the map key, and the ticket.
- **Map key:** each lane is a 26×7px round-capped swatch plus "lane world", "lane brain" or "lane crowd" in 600 Ink Two, above a 1px rule.

### Ticket
- **Style:** a station-white card with a 2px ink outline and 6px corners. The header holds the title (700, 1rem, with an Ink Two subline) and the Copy button, torn from the body by a 2px dashed Map Rule line.
- **Body:** the setup prompt in Overpass Mono at 0.82rem, each step a hanging-indented line. In the legend the preview is capped at 6.4em and fades out through a mask. The full ticket shows everything at 0.84rem.
- **Footer:** the Claude Code plugin commands in mono under a 1px rule. On phones it becomes a sentence with an "Install steps" link.

### Status board
- **Style:** a table on station white with a 2px ink outline and 6px corners. The header row is Paper Shade with Ink Two labels and a 2px ink underline. Rows are separated by 1px rules, with cells padded 18px by 20px.
- **Columns:** contract name (800), route (badges, arrow and words, in Ink Two), service (the status word with its 18px glyph).
- **Suspended row:** Suspended Wash fill. The contract's real check output opens in a full-width row directly beneath it, in a code panel.
- **States:** "Good service" is ink with a filled check disc. "Suspended" is Signal Ink with a filled bar disc.

### Code panel
- **Style:** ink fill, Terminal Text, Overpass Mono at 0.84rem, line-height 1.6. Check output uses 12px corners and 18px/20px padding. Step commands use 10px corners and 12px/14px padding. Text wraps at any character on wide screens and scrolls sideways on phones.
- **Syntax:** only the terminal palette (prompt, pass, fail, dim), plus the translucent amber mark behind the counterexample.

### Service notice (signature interaction)
- **Style:** a station-white card with a 2px signal-red border, 14px corners, 14px/16px padding, and the pinned-notice shadow. It holds the status word with a 20px glyph (800, 1.15rem), one sentence of what happened with the values in mono, a code-note line, and a compact button.
- **States:** Suspended has a signal border, Signal Ink state text and "Apply brain's fix". Good service has an ink border, ink state text and a ghost "Undo". Changing state rewrites the card and wipes it in from the top (0.5s clip-path). Under reduced motion it is a plain swap. The card is a polite live region.
- **Placement:** pinned under the closed interchange on desktop, and below the legend on phones.

### Station track (inspection)
- **Style:** one row per approach. A 6px Map Rule track with 19 stations, one per seeded bug, each in the same place on every row. Unlit stations are 14px paper dots with a 3px Map Rule ring. Lit stations are 20px white dots with a 4.5px ink ring. The tally sits beside the track in figure type ("19 of 19"), with a line of context under it.
- **Meaning:** lit means caught. The row's label and its tally say the count in words, so the lit stations never carry it alone.
- **Run:** the shipped Lanes row draws a 12px run under its stations in cobalt. That is the one place a line colour stands for something other than a lane. It is recorded here as drift, not as a pattern to extend.

### Timetable stops and terminus bar
- **Style:** a vertical 15px cobalt line (brain's fix run) with 30px white stops ringed 6px in ink. Clock times sit right-aligned in the left column, and each stop has a title and an Ink Two sentence. A stop with no logged time leaves the time blank rather than inventing one.
- **Terminus:** the last stop ends in the terminus bar, a square-ended 34×8px ink bar followed by `main · green` in mono 700 at 0.95rem. The word "green" carries the state, and the bar stays ink.

### Media frames
- **Style:** a figure with a 2px ink outline, 6px corners and a station-white body. Media sits at 16:9 on an ink ground, and the caption below (0.95rem, Ink Two, 12px/16px padding) sits under a 1px rule.
- **Video player:** a poster button. The poster image sits at 92% opacity on ink under an 84px paper play disc with a 3px ink ring and an ink triangle. On hover the poster goes to full opacity and the disc scales to 1.06 (0.3s). Pressing it swaps in a native `<video>` with controls, autoplay and focus. The video loads only on press.

## Do's and Don'ts

### Do:
- **Do** draw every lane as a 15px round-capped line at 0°, 45° or 90° in its one committed colour: world #ec6a1c, brain #1f4fd1, crowd #12945a.
- **Do** mark a contract as a white 34×56px interchange capsule with a 6px ink outline spanning the lines it joins. Close it with a signal-red ring and a 6px diagonal signal bar, and reopen it by returning both to ink.
- **Do** say every status in words with a glyph: "Good service" with the filled check disc in ink, "Suspended" with the filled bar disc in Signal Ink. A new state arrives as a new word and glyph, not a new colour.
- **Do** set line badges as circles with one capital letter: ink on orange, white on cobalt, and white on Deep Line Green (#0b6b40), never on the line green.
- **Do** keep panels flat on map paper with 2px ink outlines and 6px corners. Separate their parts with 1px Map Rule hairlines, and tear the ticket with a 2px dashed rule.
- **Do** set the numbers people read (tallies, "43 ms", "19 of 19") in Overpass 800 with tabular figures.
- **Do** keep cobalt as the single interaction colour: the 3px focus ring at a 3px offset, the primary button's hover fill, text selection and the caret.
- **Do** let the lines draw in once and let the notice flip on a fix, and keep everything else still. Under reduced motion, show the settled map and swap states plainly.

### Don't:
- **Don't** use orange, cobalt or green for anything that isn't a lane, beyond cobalt's interaction states. No coloured headings, emphasis, links at rest, backgrounds or winner highlights.
- **Don't** show "good" in green. Green is crowd's line, so good service, a reopened interchange and `main · green` are ink.
- **Don't** use signal red anywhere but a suspended interchange and the record of its failing contract.
- **Don't** carry status by colour alone. Every state is a word, and a closed interchange also carries its bar.
- **Don't** set prose, headings, labels or tallies in Overpass Mono. Mono is for code, commands, check output and the machine facts lifted from it.
- **Don't** give panels shadows. The pinned service notice is the only lifted object.
- **Don't** uppercase or letter-space labels, and don't put kickers or eyebrows above headings.
- **Don't** give a line or route square ends or bend it off 45°. Only the terminus bar is square-ended.

---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

# Surface: Lanes website (site/index.html) and the demo video's cards

Scope: the public one-page site for Lanes on GitHub Pages, plus the title, GitHub-run, benchmark and closing cards of the 70-second demo video. Visitor mode: Persuade.
Audience: hackathon teams (2–6 builders, one coding agent each). Job: decide in seconds that Lanes is worth installing, then copy the setup. Action: copy the one-prompt setup (or the two plugin lines) and open the repo.
Proof on hand (all real): the shrunk counterexample from `lanes check`, the benchmark (19/19 vs Pact 6, zod+vitest 8, tsc 3), the sandbox run (PR #3 merged by the Actions queue 22 s after opening), the live graph.
Must not feel like: a generic AI landing page, enterprise SaaS, or a page that buries the setup.

## Direction contract

THESIS: The page is a metro map of a hackathon repo. Lanes are lines, contracts are interchanges, and Lanes is the signalling that closes a broken interchange before a merge runs through it. It refuses the category default of a dark terminal hero over a grid of feature cards.

OWN-WORLD: White map paper, ink black, and three committed line colours (orange, cobalt and green, one per lane) at full saturation, with signal red reserved for a suspended interchange. Round-capped lines at 0/45/90°, white interchange rings with heavy ink outlines, circular line badges, a service-status board whose words carry status ("Good service", "Suspended", "Minor delays", "No information"), timetable stops for time, and Overpass with Overpass Mono throughout.

STORY: The visitor sees three lanes crossing at named contracts, one interchange closed with the real reason (holdMs 1800 > 1500, shrunk to one spooked agent, seed 42). They believe Lanes catches what others miss: 19 of 19 stations lit against 6, 8 and 3, and a real run merged with nobody touching it. They copy the setup ticket.

FIRST VIEWPORT: A full-bleed SVG map. Three lines enter from the edges and cross at the TickRequest, TickResponse and Haunt interchanges. The TickResponse interchange is closed, with a service notice pinned to it. The map's legend panel, top left, carries the headline, one line of offer and the ticket: the setup prompt in mono with a working Copy button (the primary action), plus the Claude Code plugin lines. Nav reads as a station index: Status · Inspection · Timetable · Map · Ticket, with GitHub.

FORM: transit map, position 1 on my ordered list (Impeccable's pick, chosen by the user over the dealt departures board). seed:141e8672f3258da1. Signature interaction: the closed interchange reopens as the service notice flips from Suspended to Good service when the fix lands (reduced motion: a plain swap). Motion grammar: lines draw in once along their paths, nothing else moves unasked.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

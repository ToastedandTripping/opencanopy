# Path to beta

How OpenCanopy gets from where it is to an open public beta, and out the other side. Ruled by
Lee on 2026-10-23 (path-to-beta grill); the binding text is in `.claude/DECISIONS.md` under that
date. The order of work is in `.claude/plans/audit-remediation-2026-10/beta-resequence.md`.

Lee: "I would like to satisfy all of the primary goals before taking this into beta, whereby
people will poke around and inevitably find further issue."

## Before beta: the gate

The charter's goal (1), a correct and honest core map, and goal (3), a landing page and
calculator that never overstate, are met. Goal (2) is built during the beta.

The beta label goes up only when all of this is true on the live site:

1. **No known serious bug** on current iPhone Safari, current Android Chrome, and desktop Chrome,
   Firefox and Safari. Serious means it breaks a feature, shows wrong or missing data, or
   overstates. Anything else is cosmetic and goes on the public known-issues note.
2. **Every public number is traced.** Each figure on the landing page, the calculator and the
   map popups has a script that derives it and a test that pins it, floored. A figure from
   outside is shown only as cited, with a visible source link.
3. **Map data appears in about 10 seconds** on an ordinary phone on 4G.
4. **Tiles are freshly rebuilt** from current government data, with the fidelity suite's result
   recorded.
5. **Error monitoring and uptime alerting are live**, on free tiers, named on /privacy.
6. **CI is green**, lint included.
7. **The beta furniture is in place:** a small "Beta" tag with a one-line note, the in-map report
   form, and the known-issues note.

A layer or feature that cannot meet the bar in time is hidden for the beta and comes back when
it is fixed. It does not hold the beta back.

## During beta

- **Open to the public** at opencanopy.ca. No invite list.
- **Feedback** comes through the in-map "report an issue" form (Netlify Forms). It records the
  place, zoom and visible layers automatically. Email is optional; there are no accounts. Reports
  land in one list, triaged for Lee.
- **A questioned number** is checked, and if wrong, corrected in public.
- **Launch:** the first week is quiet. If it is clean, a short note goes to a few conservation
  groups and a local journalist.
- **Goal (2) gets built:** the accountability view, the watershed report card and the
  conservation priority analysis, shaped by what testers find.
- **Tiles** are rebuilt every quarter by Lee with one command.

## Leaving beta

The label comes off when both hold:

- **Four weeks** from the label going up with no open serious bug and no unverified number. A
  serious bug found during the beta pauses the clock until it is fixed; it does not reset it.
- **Goal (2) has shipped.**

## What the beta guards against

In Lee's order: a wrong number spreading (a screenshot of a figure the data does not support),
and testers hitting bugs that were already known.

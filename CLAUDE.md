# CLAUDE.md

## PVP Talents

PvP talents are checked via `me.hasPvPTalent("TalentName")` — PvP talents appear as auras on the player.

## Spell Range Checks

Spell.js handles range and line-of-sight checks automatically before casting — do not add manual range checks to `spell.cast()` conditions, as they would be redundant.
# ARTIST_06 — Cultural Retrieval Nodes

**Category:** Artist / Entity · **Applies to:** Fendi Frost. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Identify the cultural sources — scene publications, curators, playlists, event listings, community archives — that AI systems and search actually retrieve when describing the Chicago house and electronic scene, and locate where the artist is absent. This is where entity discovery value is actually created.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- GEO_02 retrieval source map for scene and genre prompts
- Comparable-artist coverage from ARTIST_03
- Scene publications, archives, and curator inventories
- AUTH_02 ancestry data

## Procedure

1. Run scene-level prompts (not artist-level): who are the notable Chicago house artists, what is happening in the scene, who should I listen to. Record every source cited and every artist named.
2. Extract the retrieval nodes: which sources do platforms consistently draw on when describing this scene?
3. Classify each node by provenance type and collapse derivatives to information origins (`AUTH_02`).
4. Determine presence: is the artist mentioned on each node? Split into present, absent, and absent-but-eligible.
5. For comparable artists who do appear, trace which nodes carry them — this shows the concrete route by which a scene artist becomes retrievable.
6. Assess each node's access route honestly: editorial coverage, curator relationship, event listing, community archive submission, or no legitimate route.
7. Rank nodes by retrieval frequency, independence, and realistic access.
8. Cross-reference `AUTH_03` so that editorial nodes and cultural nodes form one coordinated target list rather than two competing ones.

## Guards — known traps

- **Never propose fabricating scene presence** — fake event listings, invented affiliations, or claimed associations with artists or venues that do not exist. Hard stop, and a reputational risk in a scene where these things are known.
- Scene and community sources often have legitimate participation norms. Recommending participation is fine; recommending gaming it is not.
- Collapse derivatives — scene coverage is heavily syndicated and aggregated.
- Absence from a node may be entirely appropriate at the artist's current stage. Record it without treating every absence as a deficiency.
- Distinguish nodes that are retrieved from nodes that merely exist; only the former are worth targeting.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `NODE (source/publication/curator/archive)`
- `RETRIEVAL FREQUENCY (from scene prompts)`
- `PROVENANCE TYPE / ORIGIN ID`
- `ARTIST PRESENT? (yes/no/eligible)`
- `COMPARABLE ARTISTS PRESENT`
- `LEGITIMATE ACCESS ROUTE`
- `PRIORITY`

## Default next measurement

Count of retrieved cultural nodes where the artist is present, and artist mention rate on scene-level prompts, monthly.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ARTIST_06`.

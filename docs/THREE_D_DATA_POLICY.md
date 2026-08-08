# 3D Data Policy — 다양한 분자의 분자구조 모델링

This policy defines how the app may use 3D molecular coordinate data for classroom visualization.

## Core Principle

3Dmol.js is a 3D coordinate viewer, not a 3D structure generator.

The app must not imply that 3Dmol.js can create reliable 3D molecular geometry from SMILES, Ketcher 2D drawings, or 2D MOL blocks. 3Dmol.js may display coordinate-bearing data that the app explicitly provides, such as SDF, MOL with 3D coordinates, XYZ, or PDB.

## Role Separation

### Ketcher

- Ketcher is the 2D structure input and editing layer.
- Ketcher output is treated as unvalidated structure data until RDKit.js parses it.
- Ketcher 2D MOL blocks must not be presented as 3D structures.

### RDKit.js

- RDKit.js is the chemistry validation and calculation layer.
- Student-facing molecular formula, molecular weight, and canonical SMILES must come from RDKit.js validation results.
- If RDKit.js validation fails, formula, molecular weight, canonical SMILES, and 3D handoff should be blocked.

### 3Dmol.js

- 3Dmol.js is the coordinate visualization layer.
- 3Dmol.js does not validate molecular correctness.
- 3Dmol.js does not provide the authoritative molecular formula or molecular weight.
- 3Dmol.js must receive a source/method label with any displayed coordinate data.

### VSEPR Prediction Model Viewer

- VSEPR prediction models are educational template renderings, not coordinate-bearing molecular structures.
- VSEPR model vectors may be drawn with 3Dmol.js, but they are unit directions for classroom explanation.
- VSEPR model vectors must not be treated as PubChem data, static 3D example data, imported 3D coordinates, or generated conformers.
- Lone-pair markers are visual aids for electron-pair direction, not physical particles.
- Ideal bond-angle labels are approximate VSEPR teaching labels, not measured or optimized geometry.

## Coordinate Data Rules

3D coordinate data is classroom visualization material. The app may provide a limited measurement MVP only when the current payload is explicitly marked as `coordinateDimension: '3d'` and comes from a coordinate-bearing source such as static example data, PubChem SDF, trusted import SDF/MOL, XYZ, or PDB.

Any displayed bond length or bond angle is a measurement from the currently loaded coordinate payload. It is not an authoritative chemistry value and must not be used as the precise basis for:

- experimental bond angles
- experimental bond lengths
- energy minimization claims
- experimental geometry claims
- stereochemical claims not encoded or validated elsewhere

The measurement UI must state the coordinate source and must not run on Ketcher 2D MOL blocks, SMILES-only structures, RDKit validation failures, or VSEPR template vectors.

## Source Tracking

Every 3D coordinate payload must carry source metadata:

- `sourceType`: for example `static-example`, `pubchem`, `user-import`, or `review-needed`
- `coordinateSource`: a student-readable source label
- `sourceNote`: a short explanation of what the coordinate data can and cannot mean
- `sourceUrl`: when the data came from an external public source

The UI or validation log must expose enough source information that a teacher can tell whether the 3D view came from an embedded example, PubChem, user import, or a review-needed source.

## Static Example Data

Current static 3D examples are embedded only for a small set of classroom molecules.

Static example coordinates are:

- educational visualization data
- not experimental values
- not generated at runtime from SMILES
- not energy-minimized in this app
- not used for formula or molecular weight

## PubChem 3D Data Policy

PubChem PUG-REST is used in the current prototype for CID-based external 3D coordinate-bearing SDF loading.
Manual candidate search may identify possible PubChem CIDs, but the app must not automatically choose a candidate for the user.

Using PubChem data requires handling these risks:

- PubChem may not have 3D coordinate data for the requested molecule.
- A PubChem search may return multiple candidate compounds.
- The PubChem structure returned for a name, SMILES, or identifier may not match the current Ketcher/RDKit-validated structure.
- PubChem 3D coordinate data is external source data and must be labeled as such.
- Network requests may fail or be unavailable in a classroom.

## PubChem Handoff Gate

PubChem 3D loading must follow this order:

1. Ketcher provides SMILES/MOL data.
2. RDKit.js validates the current structure.
3. For a user-drawn structure, PubChem lookup begins only after the user explicitly clicks the 3D output action. Editing, validation, or background state changes must not trigger a hidden lookup.
4. The app submits only the RDKit.js-validated canonical SMILES as the trusted query key and requests PubChem candidate data.
5. The user manually selects a candidate, even when PubChem returns exactly one candidate. The app must not auto-rank or auto-select it.
6. Only after that selection may the app request the selected CID's coordinate-bearing SDF with `record_type=3d`.
7. The returned SDF is parsed again with RDKit.js and compared with the current validated structure using the same hydrogen-normalized exact-match key.
8. If the candidate or final SDF is missing, ambiguous, mismatched, unparsable, or stale, the 3D viewer remains blocked.
9. Only the selected, exact-matched, coordinate-bearing, source-labeled result is passed to 3Dmol.js.

For curated example molecules that already contain a trusted local `pubchemCid`
and do not have static in-app 3D coordinates, the app may automatically request
the CID-based PubChem SDF after RDKit.js validation succeeds. This is not
automatic matching from user-drawn structures; it is a curated example handoff
using local metadata. Student-drawn structures still require a manual external
candidate search and manual candidate selection.

The Physical Molecule Scanner N5 flow has a narrower curated handoff. It does
not search by a student-entered name or auto-rank PubChem candidates. After an
explicit student action, it may request a fixed CID only when the current N4
snapshot has one exact limited-registry identity and its revision, source
revision, identity ID, and hydrogen-normalized canonical key all match the
local identity-to-CID registry. The returned SDF must still pass the same
RDKit.js exact-structure check before display. Unsupported registry entries,
including the current H2 normalization edge, remain blocked before a request.

For this scanner-only verified handoff, coordinate measurements are permitted
with all of the following restrictions:

- the payload is a current-revision, exact-matched PubChem 3D SDF;
- the UI calls it an external-database calculated conformer Reference, not an
  experimental, literature, optimized, or app-generated structure;
- distance uses two atoms joined in the SDF bond table;
- angle uses two SDF-bonded neighbors around the selected center atom;
- every result is labeled as a calculation from the current Reference
  coordinates and carries `reference-coordinate` evidence;
- photo pixels and Physical Model stick lengths are never converted to Å;
- N4 formula and molar mass remain RDKit.js results and are not sourced from
  PubChem coordinates.

This N5 measurement permission by itself does not authorize N6 comparison, correctness scoring, or
claims that the displayed values are authoritative bond-length or bond-angle
references.

### Scanner N6 Physical/Reference comparison boundary

Scanner N6 may place the student-confirmed Physical Model and the current
exact-matched Scientific Reference in a source-labelled comparison view. It
does not broaden the N5 coordinate policy:

- the Physical photo and confirmed graph remain observation evidence only;
- photo x/y coordinates, pixel distances, and kit stick lengths are never
  converted to Å or degrees;
- no Physical stable atom is paired one-to-one with an SDF atom without an
  independently verified atom map;
- Reference measurements keep `reference-coordinate` evidence and remain
  measurements of the current approved SDF coordinates;
- the app does not infer planarity, depth, correctness, or a shape answer from
  one Physical photo;
- comparison completion records student observations and revised explanation;
  it is not automatic scoring or chemical validation;
- any Physical, validation, identity, canonical, or Reference revision change
  invalidates the comparison snapshot.

N6 does not authorize classroom readiness claims, teacher scoring, submission
analytics, or N7 release decisions.

The current prototype also stores the PubChem CID SDF request URL as
`sourceUrl` metadata on the `Molecule3DInput`. The UI must not use that URL as
a primary student action label, but the source metadata may be visible for
teacher/source review.

If an older PubChem candidate search or CID-based 3D SDF response returns after
the user has validated a different structure, the app ignores that stale
response and keeps the current RDKit.js validation result and 3D state.

The user-drawn handoff is fail-closed. Network failure, timeout, malformed
responses, missing 3D coordinates, a changed RDKit validation key, or any
candidate/SDF mismatch must preserve the current 2D structure while withholding
external 3D output. The request must contain structure query data only; it must
not include student names, class identifiers, learning records, or authentication
tokens. Cached or late responses must not be reused for a different structure.

## Actual/External 3D vs VSEPR Comparison Mode

Comparison mode is a classroom observation tool. It places source-labeled
actual/external 3D coordinate data next to a VSEPR educational prediction
model so students can discuss what is similar and what is different.

The comparison mode must keep these boundaries:

- The actual/external viewer displays static example coordinates, PubChem SDF,
  or trusted imported coordinate data.
- The VSEPR viewer displays idealized AXE template vectors.
- PubChem 3D data that is only formula-compatible with the current RDKit.js
  result may be displayed as external visualization data, but it must not open
  comparison mode until the structure match is verified.
- The two viewers may both use 3Dmol.js as a rendering layer, but their data
  sources and meanings are different.
- RDKit.js formula, average molecular weight, and canonical SMILES remain the
  validated chemistry source.
- VSEPR ideal bond-angle labels are classroom predictions, not measured
  PubChem/static coordinate measurements.
- Actual/external 3D measurement tools must not be added to the VSEPR model in
  this phase.
- Comparison observations are student reflection prompts, not automatic
  scoring.

Recommended comparison examples are limited to simple single-center molecules
such as water, methane, ammonia, and carbon dioxide once actual/external 3D
data and VSEPR support are both available. Multi-center organic molecules such
as ethanol, benzene, glucose, and aspirin require caution and should not be
presented as one whole-molecule AXE comparison.

## Failure Message Separation

Student-facing messages should be direct and non-technical.

Examples:

- `이 분자에는 사용할 수 있는 3D 좌표 데이터가 아직 없습니다.`
- `외부 3D 구조를 불러오지 못했습니다. 2D 구조와 검증 결과는 계속 확인할 수 있습니다.`
- `가져온 3D 구조가 현재 검증된 분자와 일치하는지 확인이 필요합니다.`

Developer logs should include enough detail for debugging:

- query key used
- PubChem endpoint or source URL
- HTTP status or fetch error
- candidate identifier, if any
- mismatch reason
- whether 3D display was blocked

## Non-Goals

The current MVP must not implement:

- hidden, validation-triggered, or edit-triggered PubChem lookup for user-drawn structures
- automatic selection of a PubChem candidate
- bypassing the final RDKit.js revalidation and hydrogen-normalized exact-match gate
- PubChem values replacing RDKit.js formula or molecular weight
- Open Babel backend conversion
- RDKit 3D conformer generation
- SMILES-to-3D automatic generation
- energy minimization
- treating Ketcher 2D MOL blocks as 3D data
- treating VSEPR template vectors as real 3D molecular coordinates
- treating 3D viewer measurements as experimental or optimized reference geometry

## Activity Result Export Boundary

Activity result export may include 3D information only as classroom observation
metadata:

- whether coordinate-bearing 3D data was loaded;
- the student-readable coordinate source label;
- the source note;
- coordinate-based measurement results from the current actual/external 3D
  payload.

Exports must not include raw SDF/PDB/XYZ/MOL payloads by default. They must not
present PubChem/static coordinates as the source for RDKit.js formula or
average molecular weight. Measurement values remain current-coordinate
measurements and must keep the warning that they are not precise experimental,
literature, or optimized geometry values.

## Sources Checked

- PubChem PUG-REST documentation: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
- PubChem PUG-REST tutorial: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest-tutorial
- 3Dmol.js documentation: https://3dmol.org/doc/index.html

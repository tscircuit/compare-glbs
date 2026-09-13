# @tscircuit/compare-glbs

Measure the volumetric symmetric difference of two GLB models using Manifold WASM solid booleans.

```sh
bun add https://jscdn.tscircuit.com/@tscircuit/compare-glbs/0.0.1
```

```ts
import { compareGlbs } from "@tscircuit/compare-glbs"
const result = await compareGlbs(
  new Uint8Array(await Bun.file("reference.glb").arrayBuffer()),
  new Uint8Array(await Bun.file("candidate.glb").arrayBuffer()),
)
console.log(result.differenceVolume, result.intersectionOverUnion)
```

Returns `volumeA`, `volumeB`, `intersectionVolume`, `unionVolume`,
`differenceVolume` (A XOR B), `volumeDelta` (B minus A), and
`intersectionOverUnion` (intersection / union). Equal total volumes do not imply
identical shapes. Overlapping mesh instances are unioned before comparison.

Inputs must contain closed, outward-oriented static triangle solids. The default
scene (or first scene) is used, with world transforms including mirrored scale.
Material-split vertices are welded. Open, invalid, skinned and morph-target meshes
are rejected; compressed meshes requiring extensions are unsupported. Materials
and textures do not affect scores. No automatic alignment or rescaling is applied.
Both models must use the same coordinate system and units; volumes are in those
units cubed (normally cubic meters for spec-compliant glTF).

Node.js/Bun API. Manifold's WASM is provided by the `manifold-3d` dependency.

`bun install`, `bun test`, `bun run typecheck`, `bun run format:check`, `bun run build`.
Pushes to main automatically release to GitHub Packages using the handbook's
pver workflow, accessible through jscdn.tscircuit.com.

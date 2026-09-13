import { NodeIO, type Document } from "@gltf-transform/core"
import { mat4, vec3 } from "gl-matrix"
import Module, { type Manifold, type ManifoldToplevel } from "manifold-3d"

export type GlbInput = Uint8Array | ArrayBuffer
export interface VolumeComparison {
  volumeA: number
  volumeB: number
  intersectionVolume: number
  unionVolume: number
  differenceVolume: number
  volumeDelta: number
  intersectionOverUnion: number
}
let runtime: Promise<ManifoldToplevel> | undefined
const getRuntime = () =>
  (runtime ??= Module().then((m) => {
    m.setup()
    return m
  }))

function solidFromDocument(doc: Document, m: ManifoldToplevel): Manifold {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) throw new Error("GLB has no scene")
  const solids: Manifold[] = []
  try {
    scene.traverse((node) => {
      const mesh = node.getMesh()
      if (!mesh) return
      if (node.getSkin() || node.getWeights().length)
        throw new Error("Skinned and morphed meshes are unsupported")
      const positions: number[] = []
      const indices: number[] = []
      const matrix = node.getWorldMatrix()
      const mirrored = mat4.determinant(matrix) < 0
      for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4 || primitive.listTargets().length)
          throw new Error("Only static triangle meshes are supported")
        const position = primitive.getAttribute("POSITION")
        if (!position) throw new Error("Mesh is missing POSITION")
        const offset = positions.length / 3
        for (let i = 0; i < position.getCount(); i++) {
          const point = vec3.transformMat4(
            vec3.create(),
            position.getElement(i, [0, 0, 0]) as [number, number, number],
            matrix,
          )
          if (!Array.from(point).every(Number.isFinite))
            throw new Error("Non-finite mesh position")
          positions.push(...point)
        }
        const accessor = primitive.getIndices()
        const count = accessor?.getCount() ?? position.getCount()
        if (count % 3) throw new Error("Incomplete triangle")
        for (let i = 0; i < count; i += 3) {
          const triangle = [0, 1, 2].map(
            (j) => offset + (accessor ? accessor.getScalar(i + j) : i + j),
          )
          if (mirrored)
            [triangle[1], triangle[2]] = [triangle[2]!, triangle[1]!]
          indices.push(...triangle)
        }
      }
      const meshData = new m.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(positions),
        triVerts: new Uint32Array(indices),
      })
      meshData.merge()
      const solid = new m.Manifold(meshData)
      solids.push(solid)
      if (solid.status() !== "NoError" || solid.volume() <= 0)
        throw new Error(
          `Mesh must be a closed, outward-oriented solid (${solid.status()})`,
        )
    })
    if (!solids.length) throw new Error("GLB contains no solid meshes")
    const union = m.Manifold.union(solids)
    if (union.status() !== "NoError") {
      union.delete()
      throw new Error("Unable to union GLB meshes")
    }
    return union
  } finally {
    for (const solid of solids) solid.delete()
  }
}

/** Compare occupied solids in world coordinates. Volumes use the cube of input units. */
export async function compareGlbs(
  a: GlbInput,
  b: GlbInput,
): Promise<VolumeComparison> {
  const io = new NodeIO()
  const [docA, docB, m] = await Promise.all([
    io.readBinary(a instanceof Uint8Array ? a : new Uint8Array(a)),
    io.readBinary(b instanceof Uint8Array ? b : new Uint8Array(b)),
    getRuntime(),
  ])
  const owned: Manifold[] = []
  try {
    const solidA = solidFromDocument(docA, m)
    owned.push(solidA)
    const solidB = solidFromDocument(docB, m)
    owned.push(solidB)
    const intersection = m.Manifold.intersection(solidA, solidB)
    owned.push(intersection)
    if (intersection.status() !== "NoError")
      throw new Error(`Intersection failed: ${intersection.status()}`)
    const volumeA = solidA.volume()
    const volumeB = solidB.volume()
    const intersectionVolume = Math.max(
      0,
      Math.min(volumeA, volumeB, intersection.volume()),
    )
    const unionVolume = volumeA + volumeB - intersectionVolume
    return {
      volumeA,
      volumeB,
      intersectionVolume,
      unionVolume,
      differenceVolume: Math.max(0, unionVolume - intersectionVolume),
      volumeDelta: volumeB - volumeA,
      intersectionOverUnion: unionVolume ? intersectionVolume / unionVolume : 1,
    }
  } finally {
    for (const solid of owned) solid.delete()
  }
}

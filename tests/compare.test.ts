import { expect, test } from "bun:test"
import { Document, NodeIO } from "@gltf-transform/core"
import Module from "manifold-3d"
import { compareGlbs } from "../lib"

async function cube(x = 0, scale = 1, copies = 1, open = false) {
  const m = await Module()
  m.setup()
  const solid = m.Manifold.cube([1, 1, 1])
  const mesh = solid.getMesh()
  solid.delete()
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array(mesh.vertProperties))
    .setBuffer(buffer)
  const indices = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Uint32Array(open ? mesh.triVerts.slice(3) : mesh.triVerts))
    .setBuffer(buffer)
  const geometry = doc
    .createMesh()
    .addPrimitive(
      doc
        .createPrimitive()
        .setAttribute("POSITION", positions)
        .setIndices(indices),
    )
  const scene = doc.createScene()
  doc.getRoot().setDefaultScene(scene)
  for (let i = 0; i < copies; i++)
    scene.addChild(
      doc
        .createNode()
        .setMesh(geometry)
        .setTranslation([x, 0, 0])
        .setScale([scale, 1, 1]),
    )
  return new NodeIO().writeBinary(doc)
}
test("identical solids", async () => {
  const result = await compareGlbs(await cube(), await cube())
  expect(result.volumeA).toBeCloseTo(1)
  expect(result.intersectionOverUnion).toBeCloseTo(1)
  expect(result.differenceVolume).toBeCloseTo(0)
})
test("partial overlap differs despite equal volumes", async () => {
  const result = await compareGlbs(await cube(), await cube(0.5))
  expect(result.intersectionVolume).toBeCloseTo(0.5)
  expect(result.differenceVolume).toBeCloseTo(1)
  expect(result.intersectionOverUnion).toBeCloseTo(1 / 3)
})
test("disjoint and contained solids", async () => {
  expect(
    (await compareGlbs(await cube(), await cube(2))).differenceVolume,
  ).toBeCloseTo(2)
  expect(
    (await compareGlbs(await cube(), await cube(0, 0.5))).intersectionVolume,
  ).toBeCloseTo(0.5)
})
test("overlapping instances counted once and reflected winding corrected", async () => {
  expect(
    (await compareGlbs(await cube(0, 1, 2), await cube())).volumeA,
  ).toBeCloseTo(1)
  expect(
    (await compareGlbs(await cube(1, -1), await cube())).intersectionOverUnion,
  ).toBeCloseTo(1)
})
test("rejects open and invalid inputs", async () => {
  await expect(
    compareGlbs(await cube(0, 1, 1, true), await cube()),
  ).rejects.toThrow()
  await expect(compareGlbs(new Uint8Array([1]), await cube())).rejects.toThrow()
})

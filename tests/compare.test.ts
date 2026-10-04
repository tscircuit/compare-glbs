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

test("common world translation preserves thin-solid overlap", async () => {
  const local = await compareGlbs(
    await cube(0, 0.001),
    await cube(0.0005, 0.001),
  )
  const translated = await compareGlbs(
    await cube(10_000, 0.001),
    await cube(10_000.0005, 0.001),
  )
  expect(translated.volumeA).toBeCloseTo(local.volumeA, 7)
  expect(translated.volumeB).toBeCloseTo(local.volumeB, 7)
  expect(translated.intersectionVolume).toBeCloseTo(local.intersectionVolume, 7)
  expect(translated.intersectionOverUnion).toBeCloseTo(1 / 3, 6)
})

test("large world translation does not collapse a valid unit cube", async () => {
  const result = await compareGlbs(
    await cube(100_000_000),
    await cube(100_000_000),
  )
  expect(result.volumeA).toBeCloseTo(1)
  expect(result.volumeB).toBeCloseTo(1)
  expect(result.intersectionOverUnion).toBeCloseTo(1)
})

test("nested rotation and reflected nonuniform scale preserve thin-solid overlap", async () => {
  const io = new NodeIO()
  const inputs = await Promise.all(
    [0, 0.0005].map(async (x) => {
      const doc = await io.readBinary(await cube(x, 0.001))
      const scene = doc.getRoot().getDefaultScene()!
      const child = scene.listChildren()[0]!
      const parent = doc
        .createNode()
        .setTranslation([10_000, 10_000, 10_000])
        .setRotation([0, 0, Math.SQRT1_2, Math.SQRT1_2])
        .setScale([-2, 3, 4])
        .addChild(child)
      scene.addChild(parent)
      return io.writeBinary(doc)
    }),
  )
  const result = await compareGlbs(inputs[0]!, inputs[1]!)
  expect(result.volumeA).toBeCloseTo(0.024, 7)
  expect(result.volumeB).toBeCloseTo(0.024, 7)
  expect(result.intersectionVolume).toBeCloseTo(0.012, 7)
  expect(result.intersectionOverUnion).toBeCloseTo(1 / 3, 6)
})

test("rejects singular transforms and non-finite positions", async () => {
  await expect(compareGlbs(await cube(0, 0), await cube())).rejects.toThrow()
  const io = new NodeIO()
  const doc = await io.readBinary(await cube())
  doc
    .getRoot()
    .listMeshes()[0]!
    .listPrimitives()[0]!
    .getAttribute("POSITION")!
    .setElement(0, [Number.NaN, 0, 0])
  await expect(
    compareGlbs(await io.writeBinary(doc), await cube()),
  ).rejects.toThrow("Non-finite mesh position")
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

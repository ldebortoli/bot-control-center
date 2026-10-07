import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

test("source maps reject invalid section offsets while preserving valid mappings", () => {
  // Isolate the dependency guardrail so a future regression cannot block the
  // test runner. Only construct maps: never expand enormous offsets into text.
  const probe = `
    const assert = require("node:assert/strict");
    const { SourceMapConsumer } = require("source-map-js");
    const source = { version: 3, sources: ["fixture.js"], names: [], mappings: "AAAA" };
    const indexed = (line, column, map = source) => ({
      version: 3, sections: [{ offset: { line, column }, map }],
    });
    for (const value of [-1, 1.5, NaN, Infinity, "1", null]) {
      assert.throws(() => new SourceMapConsumer(indexed(value, 0)), /non-negative integers/);
      assert.throws(() => new SourceMapConsumer(indexed(0, value)), /non-negative integers/);
    }
    assert.throws(() => new SourceMapConsumer(indexed(10000001, 0)), /must not exceed/);
    assert.throws(
      () => new SourceMapConsumer(indexed(6000000, 0, indexed(6000000, 0))),
      /including offsets of nested sections/,
    );
    const positions = [];
    new SourceMapConsumer(indexed(2, 0)).eachMapping(mapping => positions.push({
      source: mapping.source,
      generatedLine: mapping.generatedLine,
      generatedColumn: mapping.generatedColumn,
      originalLine: mapping.originalLine,
      originalColumn: mapping.originalColumn,
    }));
    assert.deepEqual(positions, [{
      source: "fixture.js", generatedLine: 3, generatedColumn: 0,
      originalLine: 1, originalColumn: 0,
    }]);
    process.stdout.write("source-map guardrails passed");
  `;
  const output = execFileSync(process.execPath, ["--input-type=commonjs", "-e", probe], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    timeout: 5000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  assert.equal(output, "source-map guardrails passed");
});

test("the native image dependency decodes and resizes a local SVG without altering its pixels", async () => {
  // This checks the updated native addon and librsvg, not the Cloudflare IMAGES
  // service used by the Worker. The fixture contains no external resources.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"><rect width="16" height="8" fill="#48605a"/></svg>');
  const png = await sharp(svg).resize(8, 4).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 8);
  assert.equal(metadata.height, 4);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data.length, 8 * 4 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    assert.deepEqual([...data.subarray(offset, offset + 4)], [72, 96, 90, 255]);
  }
});

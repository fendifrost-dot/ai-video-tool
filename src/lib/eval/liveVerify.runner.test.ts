import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePpm } from "./pixelMath";
import {
  imageToPpm,
  invokeArchitectureCStillRepair,
  runFixturePipeline,
  scoreStillPair,
  STAGE1K_CANONICAL,
  STAGE1K_EXPECTED_VERSION,
  STAGE1L_EXPECTED_VERSION,
  writeScorePackage,
  type InvokeResult,
} from "./liveVerify";

const enabled = process.env.STAGE1K_HARNESS === "1";

describe.skipIf(!enabled)("Stage 1k live harness runner", () => {
  it("invoke / score / fixture per env", async () => {
    const outRoot = process.env.STAGE1K_OUT_DIR;
    expect(outRoot, "STAGE1K_OUT_DIR").toBeTruthy();
    mkdirSync(outRoot!, { recursive: true });

    if (process.env.STAGE1K_INVOKE === "1") {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
      const userToken = process.env.AVT_USER_ACCESS_TOKEN || process.env.AVT_ACCESS_TOKEN || "";
      const anon =
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
      const token = userToken || anon;
      const expectedVersion =
        process.env.EXPECTED_REPAIR_METHOD_VERSION ||
        (process.env.STAGE1L_HARNESS === "1" ? STAGE1L_EXPECTED_VERSION : STAGE1K_EXPECTED_VERSION);
      const invoke: InvokeResult = await invokeArchitectureCStillRepair({
        supabaseUrl,
        accessToken: token,
      });
      const invokePath = join(outRoot!, "invoke.json");
      writeFileSync(
        invokePath,
        `${JSON.stringify(
          {
            ...invoke,
            authKind: userToken ? "user_access_token" : anon ? "anon_publishable_key" : "missing",
            expectedVersion,
            versionMatch: invoke.repairMethodVersion === expectedVersion,
            canonical: STAGE1K_CANONICAL,
          },
          null,
          2,
        )}\n`,
      );
      expect(invoke.httpStatus).toBeGreaterThan(0);
    }

    const sourcePath = process.env.STAGE1K_SOURCE_IMAGE;
    const outputPath = process.env.STAGE1K_OUTPUT_IMAGE;
    const label = process.env.STAGE1K_LABEL || "pair";
    const live = process.env.STAGE1K_LIVE === "1";
    if (sourcePath && outputPath) {
      const pairDir = join(outRoot!, label);
      mkdirSync(pairDir, { recursive: true });
      const sourcePpm = join(pairDir, "source.ppm");
      const outputPpm = join(pairDir, "output.ppm");
      imageToPpm(sourcePath, sourcePpm);
      imageToPpm(outputPath, outputPpm);
      const source = decodePpm(readFileSync(sourcePpm));
      const output = decodePpm(readFileSync(outputPpm));
      const pkg = scoreStillPair(source, output, label, live, STAGE1K_CANONICAL.bandQuad);
      writeScorePackage(pkg, pairDir);
      writeFileSync(
        join(pairDir, "gate.txt"),
        `${pkg.report.verdict} ${pkg.report.passCount}/11\n`,
      );
      for (const tmp of [sourcePpm, outputPpm]) {
        try {
          unlinkSync(tmp);
        } catch {
          /* optional */
        }
      }
    }

    if (process.env.STAGE1K_FIXTURE === "1") {
      const fixtureDir = join(outRoot!, "fixture_1k");
      const { source, output } = runFixturePipeline();
      const pkg = scoreStillPair(source, output, "fixture_1k", false, STAGE1K_CANONICAL.bandQuad);
      writeScorePackage(pkg, fixtureDir);
      writeFileSync(
        join(fixtureDir, "gate.txt"),
        `${pkg.report.verdict} ${pkg.report.passCount}/11\n`,
      );
    }
  }, 180_000);
});

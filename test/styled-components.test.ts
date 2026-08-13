import { expect, test } from "bun:test";
import { createStyledComponentsFixture } from "../scripts/styled-components-fixture";
import {
  profileStageDefinitions,
  profileStyledComponentsOnce,
} from "../scripts/styled-components-profiler";
import {
  STYLED_COMPONENTS_TRANSFORMERS,
  transformStyledComponentsFor,
  validateStyledComponentsOutput,
} from "../scripts/styled-components-transformers";

const fixture = createStyledComponentsFixture(4);

for (const name of STYLED_COMPONENTS_TRANSFORMERS) {
  test(`${name} satisfies the styled-components transform contract`, () => {
    const output = transformStyledComponentsFor(name, fixture.source);
    const validation = validateStyledComponentsOutput(name, output, fixture);

    expect(validation.withConfigCalls).toBe(fixture.styledComponentCount);
    expect(validation.uniqueComponentIds).toBe(fixture.styledComponentCount);
    expect(validation.pureAnnotations).toBeGreaterThanOrEqual(
      fixture.styledComponentCount + 3,
    );
    expect(validation.taggedTemplates).toBe(0);
  });

  test(`${name} split profile preserves the transform contract`, () => {
    const profile = profileStyledComponentsOnce(name, fixture.source);
    const validation = validateStyledComponentsOutput(name, profile.output, fixture);

    expect(profile.durationsNs).toHaveLength(profileStageDefinitions(name).length);
    expect(profile.durationsNs.every((duration) => duration > 0)).toBe(true);
    expect(validation.withConfigCalls).toBe(fixture.styledComponentCount);
    expect(validation.taggedTemplates).toBe(0);
  });
}

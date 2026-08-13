export const STYLED_COMPONENTS_COMPONENT_COUNT = 240;
export const STYLED_COMPONENTS_FILENAME = "/benchmark/src/styled-components-fixture.js";

export interface StyledComponentsFixture {
  source: string;
  styledComponentCount: number;
  templateCount: number;
}

function componentFactory(index: number): string {
  switch (index % 4) {
    case 0:
      return `styled.article.attrs({ role: "article", "data-index": ${index} })`;
    case 1:
      return "styled(BaseComponent).attrs((props) => ({ tabIndex: props.tabIndex ?? 0 }))";
    case 2:
      return "styled.section";
    default:
      return 'styled("aside")';
  }
}

export function createStyledComponentsFixture(
  styledComponentCount = STYLED_COMPONENTS_COMPONENT_COUNT,
): StyledComponentsFixture {
  if (!Number.isInteger(styledComponentCount) || styledComponentCount < 1) {
    throw new RangeError("styledComponentCount must be a positive integer");
  }
  if (styledComponentCount > 10_000) {
    throw new RangeError("styledComponentCount must not exceed 10000");
  }

  const lines = [
    'import styled, { css, createGlobalStyle, keyframes } from "styled-components";',
    "const BaseComponent = (props) => props.as ?? null;",
    "const sharedSurface = css`",
    "  border: 1px solid rgba(0, 0, 0, 0.12);",
    "  border-radius: 8px;",
    "`;",
    "const enter = keyframes`",
    "  from { opacity: 0; transform: translateY(4px); }",
    "  to { opacity: 1; transform: translateY(0); }",
    "`;",
    "export const GlobalStyle = createGlobalStyle`",
    "  html, body { margin: 0; padding: 0; }",
    "  *, *::before, *::after { box-sizing: border-box; }",
    "`;",
  ];

  for (let index = 0; index < styledComponentCount; index++) {
    const suffix = index.toString().padStart(3, "0");
    lines.push(`export const Card${suffix} = ${componentFactory(index)}\``);
    lines.push("  ${sharedSurface}");
    lines.push("  display: grid;");
    lines.push("  grid-template-columns: minmax(0, 1fr) auto;");
    lines.push("  gap: ${props => props.gap ?? 8}px;");
    lines.push('  color: ${props => props.active ? "#005fcc" : "#172033"};');
    lines.push("  background: linear-gradient(135deg, #fff, #f4f7fb);");
    lines.push("  animation: ${enter} 180ms ease-out;");
    lines.push("  &:hover,");
    lines.push("  &:focus-visible {");
    lines.push("    border-color: #005fcc;");
    lines.push("    transform: translateY(-1px);");
    lines.push("  }");
    lines.push("  ${props => props.compact && css`");
    lines.push("    padding: 2px 4px;");
    lines.push("    > span { white-space: nowrap; }");
    lines.push("  `}");
    lines.push("`;\n");
  }

  return {
    source: lines.join("\n"),
    styledComponentCount,
    templateCount: styledComponentCount * 2 + 3,
  };
}

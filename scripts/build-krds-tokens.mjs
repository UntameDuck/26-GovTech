/**
 * KRDS 디자인 토큰 → CSS 사용자 정의 속성 변환.
 *
 *   node_modules/krds-uiux/tokens/transformed_tokens.json
 *     → src/krds/tokens.generated.css
 *
 * 이렇게 하는 이유:
 *  - KRDS 가 정한 값을 우리가 손으로 베껴 적지 않는다. 색상 하나라도 직접 쓰면
 *    "KRDS 를 따랐다"는 주장이 검증 불가능해진다. 이 스크립트가 근거가 된다.
 *  - krds-uiux 를 업데이트하면 이 스크립트를 다시 돌리는 것으로 끝난다.
 *  - mode-high-contrast 토큰이 함께 들어 있어 고대비 모드를 처음부터 켤 수 있다.
 *    (KWCAG 대응에 필요하고, 나중에 붙이면 훨씬 비싸다.)
 *
 * 실행: npm run krds:tokens
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

const SOURCE = resolve(
  projectRoot,
  "node_modules/krds-uiux/tokens/transformed_tokens.json",
);
const OUTPUT = resolve(projectRoot, "src/krds/tokens.generated.css");

const tokens = JSON.parse(readFileSync(SOURCE, "utf8"));

/** "{primitive.color.light.gray.5}" 같은 참조를 실제 값으로 바꾼다. */
function resolveValue(raw, depth = 0) {
  if (typeof raw !== "string") return raw;
  if (depth > 10) throw new Error(`토큰 참조가 너무 깊습니다: ${raw}`);

  const match = /^\{([^}]+)\}$/.exec(raw.trim());
  if (!match) return raw;

  const path = match[1].split(".");
  let node = tokens;
  for (const segment of path) {
    node = node?.[segment];
    if (node === undefined) {
      throw new Error(`토큰 참조를 찾을 수 없습니다: ${raw}`);
    }
  }
  return resolveValue(node.value, depth + 1);
}

/** 토큰 트리를 순회하며 [cssVarName, value] 목록을 만든다. */
function collect(node, prefix, out) {
  if (node && typeof node === "object") {
    if ("value" in node && "type" in node) {
      out.push([prefix, resolveValue(node.value)]);
      return out;
    }
    for (const [key, child] of Object.entries(node)) {
      collect(child, prefix ? `${prefix}-${key}` : key, out);
    }
  }
  return out;
}

function toBlock(selector, entries, comment) {
  const lines = entries
    .map(([name, value]) => `  --krds-${name}: ${value};`)
    .sort();
  return `/* ${comment} */\n${selector} {\n${lines.join("\n")}\n}\n`;
}

// primitive: 원시 팔레트. 직접 쓰기보다 아래 semantic/mode 값의 재료로 쓴다.
const primitive = collect(tokens.primitive, "primitive", []);

// semantic: gap / padding / radius / size-height
const semantic = collect(tokens.semantic, "", []);

// mode-light: surface / border / text / link / button ... 실제로 가장 많이 쓰는 값
const modeLight = collect(tokens["mode-light"].color, "", []).concat(
  collect(tokens["mode-light"]["border-width"], "border-width", []),
);

// mode-high-contrast: 같은 이름을 고대비 값으로 덮어쓴다.
const modeHighContrast = collect(tokens["mode-high-contrast"].color, "", []).concat(
  collect(tokens["mode-high-contrast"]["border-width"], "border-width", []),
);

// 반응형 치수
const responsivePc = collect(tokens["responsive-pc"], "", []);
const responsiveMobile = collect(tokens["responsive-mobile"], "", []);

const header = `/*
 * 이 파일은 자동 생성됩니다. 직접 수정하지 마세요.
 *
 *   생성 명령: npm run krds:tokens
 *   원본:      krds-uiux/tokens/transformed_tokens.json
 *
 * 값을 바꿔야 한다면 KRDS 토큰을 바꾸는 것이 아니라,
 * src/krds/theme.css 에서 우리 쪽 별칭을 조정하세요.
 */
`;

const css = [
  header,
  toBlock(":root", [...primitive, ...semantic, ...modeLight], "KRDS 기본 (light 모드)"),
  toBlock(
    '[data-krds-contrast="high"]',
    modeHighContrast,
    "KRDS 고대비 모드 — KWCAG 대응",
  ),
  toBlock(":root", responsiveMobile, "반응형 — 모바일 기준값"),
  `/* 반응형 — PC */\n@media (min-width: 768px) {\n  :root {\n${responsivePc
    .map(([n, v]) => `    --krds-${n}: ${v};`)
    .sort()
    .join("\n")}\n  }\n}\n`,
].join("\n");

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, css, "utf8");

const total =
  primitive.length +
  semantic.length +
  modeLight.length +
  modeHighContrast.length +
  responsivePc.length +
  responsiveMobile.length;

console.log(`KRDS 토큰 ${total}개를 변환했습니다.`);
console.log(`  primitive        ${primitive.length}`);
console.log(`  semantic         ${semantic.length}`);
console.log(`  mode-light       ${modeLight.length}`);
console.log(`  mode-high-contrast ${modeHighContrast.length}`);
console.log(`  responsive       ${responsivePc.length} (pc) / ${responsiveMobile.length} (mobile)`);
console.log(`→ ${OUTPUT}`);

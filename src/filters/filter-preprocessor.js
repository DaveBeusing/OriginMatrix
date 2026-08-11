export const ORIGINMATRIX_FILTER_CAPABILITIES = Object.freeze({
  env_chromium: true,
  env_mv3: true,
  env_mobile: false,
  env_firefox: false,
  env_safari: false,
  ext_originmatrix: true,
  ext_ubol: false,
  cap_dnr: true,
  cap_html_filtering: false,
  cap_ipaddress: false,
});

const DIRECTIVE = /^\s*!#(if|else|endif|include)\b(?:\s+(.*))?\s*$/;
const SAFE_INCLUDE = /^[a-z0-9][a-z0-9._/-]*\.txt$/i;
const MAX_INCLUDE_DEPTH = 8;

export async function preprocessFilterText(source, {
  capabilities = ORIGINMATRIX_FILTER_CAPABILITIES,
  include = null,
  sourceName = "filter-list.txt",
} = {}) {
  if (typeof source !== "string") throw new TypeError("Filter source must be a string.");
  const diagnostics = { directives: 0, branchesExcluded: 0, includesResolved: 0, includesSkipped: 0 };
  const output = await processSource(source, sourceName, capabilities, include, diagnostics, [], 0);
  return Object.freeze({ source: output, diagnostics: Object.freeze(diagnostics) });
}

async function processSource(source, sourceName, capabilities, include, diagnostics, ancestors, depth) {
  const lines = source.split(/\r?\n/);
  const output = [];
  const stack = [];
  let active = true;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(DIRECTIVE);
    if (!match) {
      if (active) output.push(line);
      else diagnostics.branchesExcluded += 1;
      continue;
    }
    diagnostics.directives += 1;
    const [, command, rawArgument = ""] = match;
    if (command === "if") {
      const condition = evaluateExpression(rawArgument, capabilities, sourceName, index + 1);
      stack.push({ parentActive: active, condition, elseSeen: false });
      active = active && condition;
    } else if (command === "else") {
      const frame = stack.at(-1);
      if (!frame || frame.elseSeen || rawArgument) throw syntaxError(sourceName, index + 1, "Unexpected !#else");
      frame.elseSeen = true;
      active = frame.parentActive && !frame.condition;
    } else if (command === "endif") {
      if (rawArgument || stack.length === 0) throw syntaxError(sourceName, index + 1, "Unexpected !#endif");
      active = stack.pop().parentActive;
    } else if (active) {
      const name = rawArgument.trim();
      if (!include || !SAFE_INCLUDE.test(name) || name.includes("..") || depth >= MAX_INCLUDE_DEPTH || ancestors.includes(name)) {
        diagnostics.includesSkipped += 1;
        continue;
      }
      const included = await include(name, sourceName);
      if (typeof included !== "string") {
        diagnostics.includesSkipped += 1;
        continue;
      }
      diagnostics.includesResolved += 1;
      output.push(await processSource(included, name, capabilities, include, diagnostics, [...ancestors, name], depth + 1));
    }
  }
  if (stack.length > 0) throw syntaxError(sourceName, lines.length, "Missing !#endif");
  return output.join("\n");
}

function evaluateExpression(source, capabilities, sourceName, line) {
  const match = source.trim().match(/^(!)?([a-z][a-z0-9_]*)$/i);
  if (!match) throw syntaxError(sourceName, line, "Unsupported !#if expression");
  const enabled = capabilities[match[2]] === true;
  return match[1] ? !enabled : enabled;
}

function syntaxError(sourceName, line, message) {
  return new SyntaxError(`${message} at ${sourceName}:${line}.`);
}

# Security

## Architecture review baseline

OriginMatrix 1.19.0 was reviewed against remote-code execution, injection and XSS, unsafe HTML, parser and selector denial of service, scriptlet argument abuse, corrupted storage, malformed lists, custom-filter input, bounded selector generation, DNR rule exhaustion, and extension permissions.

- All executable JavaScript is bundled. Filter downloads are data only, require catalogued HTTPS URLs, reject redirects, and never become executable code.
- UI values are assigned with DOM text properties. The extension does not use `innerHTML`, `eval`, dynamic functions, or remote assets.
- Runtime messages are accepted only from OriginMatrix itself and have a serialized size ceiling.
- Filter sources, lines, scriptlet arguments, policy imports, per-document selectors, stored generations, and DNR generations have explicit limits.
- Procedural cosmetic evaluation has independent limits for rules, mutation roots, ancestor depth, candidate nodes, text length, debounce timing, and regular-expression syntax.
- Scriptlets must resolve through the bundled registry, pass scriptlet-specific argument validation, and execute the registered function object in an explicitly targeted tab frame.
- Stored policy, profile, list-setting, and generation documents are schema-validated before use. Update activation and imports preserve rollback behavior.

## Permission review

- `declarativeNetRequest` installs the blocking rules.
- `declarativeNetRequestFeedback` provides exact rule attribution where Chromium makes the debug API available.
- `scripting` runs only bundled, registry-approved scriptlets in matched frames.
- `storage` persists policies, profiles, validated list generations, and session-only observations.
- `tabs` reads the active tab URL, reloads changed pages, and cleans tab-scoped state.
- `webNavigation` reports same-document History API and fragment transitions so filters can be re-evaluated without patching page JavaScript.
- `webRequest` observes request metadata without blocking or modifying traffic.
- `<all_urls>` is required because a request firewall must apply network, cosmetic, and scriptlet protection across user-visited HTTP(S) sites. Content scripts themselves remain restricted to HTTP(S) matches.

No externally connectable messaging, native messaging, downloads, cookies, history, or remote-code permission is declared.

## Reporting a vulnerability

Do not include sensitive browsing data in a public report. Provide a minimal reproduction, affected version, and expected impact through the repository's private security-reporting channel when available.

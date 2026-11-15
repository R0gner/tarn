// tarn · the CHANGELOG section of one version, as text for a GitHub release. Pure: no file access (tools/release-notes.mjs reads the files).

/**
 * Text of the section `## <version>` of a changelog: everything up to the next `## ` heading, trimmed.
 * The heading is matched on the whole version token, so 0.5.1 does not match 0.5.10; a suffix such as "(unreleased)" or a date after the version is allowed.
 * @param {string} changelog
 * @param {string} version e.g. "0.5.3"
 * @returns {string | null} the section without its heading, or null when there is no such section or it is empty
 */
export function releaseNotes(changelog, version) {
  const lines = String(changelog).replace(/\r\n?/g, '\n').split('\n');
  const isHead = (l) => /^## /.test(l);
  const start = lines.findIndex((l) => isHead(l) && l.slice(3).trim().split(/\s+/)[0] === version);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && isHead(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  return body || null;
}

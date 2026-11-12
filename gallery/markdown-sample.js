// dashkit · sample report for the gallery (invented): roughly how an agent writes a run report.
export const REPORT = `## Run 412 · Offsite archive sync

**Result:** failed after 31 s, *exit code 12* (\`rsync\`: protocol error in the data stream).
The last successful run was **yesterday 04:15**, before that 5 of 7 runs were error-free.

### What happened

1. Connected to \`nas-b\` (SSH, 0.4 s)
2. File list transferred: 18,204 entries, 312 of them new
3. After 4.2 GB the remote end dropped (\`connection unexpectedly closed\`)
   - the receiver reported \`No space left on device\` for \`/archive/.rsync-partial\` shortly before
   - usage of \`/archive\`: **93%** (threshold 90%)

> Probably lack of space on the target, not the network: the transfer ran at 118 MB/s until then.

### Check

| Target | Used | Free | Status |
|---|--:|--:|:--:|
| nas-b:/archive | 868 GB | 63 GB | Warning |
| nas-b:/backup | 412 GB | 520 GB | OK |
| nas-a:/srv | 1.2 TB | 800 GB | OK |

### Recommendation

- [x] Log reviewed (\`/var/log/offsite-sync/2026-11-09.log\`)
- [x] Usage of the targets checked
- [ ] Remove old partial transfers: \`rsync --delete-excluded --partial-dir=.rsync-partial\`
- [ ] Lower the threshold for \`/archive\` to 85%
- [ ] Repeat the run once at least 100 GB are free

\`\`\`sh
# Free up space, then start again
find /archive/.rsync-partial -type f -mtime +7 -delete
systemctl start offsite-sync.service
\`\`\`

More notes: <https://example.com/runbooks/offsite-sync> and [backup concept](docs/backup-concept.md).
A long path without a break opportunity: /srv/stack/compose/services/offsite-sync/config/rsync/filters/exclude-patterns-archive.list

---

Created by *backup agent* · run ID \`a41f-9c02-77d1\``;

/** Security cases for the gallery: raw HTML, unsafe links, images, unclosed markers. */
export const SECURITY_CASES = [
  ['Raw HTML text', '<script>alert(1)</script> and <b>bold?</b>'],
  ['javascript: link', '[Click me](javascript:alert(1))'],
  ['Protocol-relative', '[external](//example.com/x)'],
  ['Image (off)', '![Diagram](https://example.com/x.png)'],
  ['Unclosed', '**never closed and `code without end'],
];

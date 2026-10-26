# Fixture provenance and expectations

This document distinguishes reference material from fresh execution. No reference result is counted as a new test run.

Primary sources retrieved for this attempt:
- [GitHub advisory GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), saved as [advisory.json](reference/advisory.json).
- [Upstream fix 780911d84d18e2c5fa008ed0c0d387631ec11965](https://github.com/jshttp/proxy-addr/commit/780911d84d18e2c5fa008ed0c0d387631ec11965), saved as [upstream-fix.json](reference/upstream-fix.json).
- [Release 2.0.8](https://github.com/jshttp/proxy-addr/releases/tag/v2.0.8), saved as [release.json](reference/release.json).
- [PR106](https://github.com/truxt-ai/ops-dashboard/pull/106), head `2b6a64fb5edc323081162457b989878a36c686ff`, saved as [pr106.json](reference/pr106.json), [pr106.diff](reference/pr106.diff), and [reference fixture bytes](reference/proxy-addr-security.test.js).
- [AXM-707](https://axiom-stage.truxt.ai/b560f8c8/backend/issues/AXM-707), historical evidence, saved as [AXM-707.json](reference/AXM-707.json).

The advisory identifies two problematic trust configurations: `::ffff:10.0.0.0/8` and `::/1`. A client outside the named private range must not acquire proxy authority from those IPv6 configurations. The upstream repair rejects IPv4 candidates unless the IPv6 subnet genuinely covers the mapped marker. This provides an independent expectation, rather than selecting expected values from observed library outputs.

PR106 supplies the exact client addresses `203.0.113.9` and `::ffff:203.0.113.9`, attacker-selected `X-Forwarded-For: 192.0.2.99`, and the private proxy control `10.1.2.3` forwarding `198.51.100.10`.

| Case | Trust and inputs | Independent expectation |
| --- | --- | --- |
| S1 | Trust `::ffff:10.0.0.0/8`; both public client spellings above; forwarded value `192.0.2.99` | Client untrusted; resolved client remains the connection address |
| S2 | Trust `::/1`; same public clients and forwarded value | Client untrusted; resolved client remains the connection address |
| C1 | Trust `10.0.0.0/8`; proxy `10.1.2.3`; forwarded `198.51.100.10` | Legitimate private proxy trusted; return forwarded client |
| C2 | Public client `203.0.113.9` must remain untrusted; application default trust remains false | Ignore arbitrary forwarded address and preserve the direct connection address |

PR106's third case covers both a legitimate trusted proxy and rejection of a public client. Its fourth case checks the application setting only. The AXM-708 candidate preserves the filename and all prior assertions, explicitly names S1/S2/C1/C2, resolves proxy-addr through Express, and strengthens C2 with the actual public-client trust and forwarding decision. C1 also explicitly checks the legitimate private proxy is trusted. Coordinator guidance `msg_fe01b73d44a9` directed this scoped strengthening on the assigned AXM-708 branch, with one coordinator-published candidate PR referencing PR106.

Fresh vulnerable execution at 08:50:42 UTC produced exactly two `ERR_ASSERTION` failures (`true !== false`) for S1/S2 and two passes for C1/C2; no setup failures qualified. [Full output](vulnerable/regression.txt), [overlay identity and digest](vulnerable/fixture.json), [preserved fixture bytes](vulnerable/proxy-addr-security.test.js). SHA-256: `e76f67d4761dd00dcb7be10e4bf6e500666a33418176fb194766fe5965215452`. Each failing case stops at its first direct-client trust assertion, so later forwarding and mapped-client assertions are not claimed to have executed in the red run.

Application trust proxy stays disabled. These dependency fixtures exercise the advisory precondition in isolation and do not establish current application exploitability. [Fresh baseline version proof](baseline/versions.txt) confirms Express resolves proxy-addr 2.0.7 and the app setting is false.

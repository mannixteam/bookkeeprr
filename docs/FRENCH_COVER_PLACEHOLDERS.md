# Provider-specific cover placeholder evidence

Investigation: 2026-09-27, from the development workspace only.
No verified illustrated placeholder was obtained. **No provider-specific image
fingerprint or visual rejection rule has been added.** Existing HTTP, decoding,
dimension, blank-image and explicit-placeholder-URL checks remain in effect.

## Requests and observations

Requests used the application's User-Agent and Accept headers, a ten-second
socket timeout and an 8 MiB + 1-byte maximum response read. No credentials were
sent. The identifiers below are probe inputs, not assertions that the catalog
contains those editions or that the corresponding books have no cover.

| Probe | URL | First request | Second request |
| --- | --- | --- | --- |
| BnF synthetic ARK | `https://openapi.bnf.fr/couverture/image/image/recupererImage?idArk=ark%3A%2F12148%2Fcb00000000x&couverture=1&taille=originale&largeur=900&hauteur=1400` | HTTP 500 | HTTP 500, HTML |
| DLP synthetic checksum-valid EAN | `https://bdi.dlpdomain.com/album/9780000000002/couv/M385x862/cover.jpg` | HTTP 404 | Socket timeout |
| DLP existing test EAN (control attempt) | `https://bdi.dlpdomain.com/album/9782723488525/couv/M385x862/cover.jpg` | Socket timeout | Not repeated |

The second BnF response had:

- Content-Type: `text/html;charset=utf-8`.
- Length: 5,899 bytes.
- SHA-256: `68aa7755509349a55ab3d08c3be901850aa79434366bf7c953ca5f12d977bcdb`.
- An HTTP 500 error-page title; no image bytes.
- No redirect observed (final URL identical to requested URL).

That hash identifies the observed HTML response **for provenance only**. It is
not an image-placeholder fingerprint and must not be added to an image denylist.
The raw error page is not retained as a test fixture: the existing HTTP 500 and
HTML tests already exercise the relevant rejection, and a server exception page
cannot validate illustrated-placeholder recognition.

The initial DLP 404 body was not captured; subsequent timeouts prevented a body
sample and successful control image. An auxiliary web retrieval tool also could
not access the two synthetic-probe URLs. No claim is made that the services are
universally unavailable, or that they never return illustrated placeholders.
No access control was changed and no VM request was made.

## Requirement still open

A real, visually verified provider placeholder is still required before adding
exact recognition. Retain its original bytes, source URL, response status/MIME,
capture date and checksum, and document how missing-cover status was established.
Use repeated missing-cover responses plus a verified genuine-cover control;
then test exact rejection and the existing edition-bound fallback. Avoid broad
visual similarity rules that can reject legitimate artwork.

Until such samples are accessible, this phase remains open. Do not repeat this
same synthetic-probe investigation without new evidence or improved access.
The synthetic generated images already used in decoder tests are not captured
BnF/DLP placeholders and must not be relabelled as such.

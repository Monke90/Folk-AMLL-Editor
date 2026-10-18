<img src="./favicons/normal/brand.svg" width="80px" />

# Folk AMLL Editor

[![Version](https://img.shields.io/github/package-json/v/Monke90/Folk-AMLL-Editor?label=Version)](https://github.com/Monke90/Folk-AMLL-Editor/releases)
[![Vite Version](https://img.shields.io/github/package-json/dependency-version/Monke90/Folk-AMLL-Editor/dev/vite?label=Vite&color=9135FF&logo=vite&logoColor=white)](https://vite.dev/)
[![Vue Version](https://img.shields.io/github/package-json/dependency-version/Monke90/Folk-AMLL-Editor/vue?label=Vue&color=4FC08D&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![PrimeVue Version](https://img.shields.io/github/package-json/dependency-version/Monke90/Folk-AMLL-Editor/primevue?label=PrimeVue&color=41B883&logo=primevue&logoColor=white)](https://primevue.org/)
[![AMLL Core Version](https://img.shields.io/github/package-json/dependency-version/Monke90/Folk-AMLL-Editor/%40applemusic-like-lyrics%2Fcore?label=AMLL&color=FA243C&logo=applemusic&logoColor=white)](https://amll.dev)  
[![Website](https://img.shields.io/website?url=https%3A%2F%2Ffolk-amll-tool.xyz%2F&label=Website)](https://folk-amll-tool.xyz)

An open-source lyrics editor with per-syllable timing support, built with Vue. It works with the [AMLL](https://github.com/amll-dev/applemusic-like-lyrics) ecosystem.

> [!NOTE]
> **Folk AMLL Editor is a fork of [amll-dev/amll-editor](https://github.com/amll-dev/amll-editor)**, maintained and developed by [InternalMonke](https://yoursit.ee/folk). Credit for the original editor goes to the upstream authors and contributors.

- **Website**: https://folk-amll-tool.xyz

## Deployment

The editor is hosted online — you can use it directly via the link above.

If you want to self-host the project, please note:

The spectrogram feature requires **Cross Origin Isolation (COI)** to be enabled. Your server must include the following response headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

This repository already includes a `_headers` file compatible with Cloudflare Pages that automatically applies these headers during deployment.

For other platforms (Vercel, Netlify, etc.), please refer to their respective documentation to configure custom response headers.

**GitHub Pages does not support custom response headers**, so it cannot natively satisfy the COI requirement. This project includes an optional workaround: When the environment variable `VITE_COI_WORKAROUND` is set to a truthy value, a Service Worker (based on [gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)) will be activated to emulate a cross-origin isolated environment.

Known limitations of this workaround:

- The page will perform an additional automatic reload on first visit
- The Service Worker only takes effect after this reload
- Compatibility checks are delayed by ~3 seconds to allow the Service Worker to fully register

## License

This project is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](./LICENSE) for details.

SPDX-License-Identifier: AGPL-3.0-only

## Legal Notice

This project provides playback compatibility for various audio containers, including some proprietary formats that may be used by certain music services. It **DOES NOT** remove or alter any Digital Rights Management (DRM) measures, nor does it enable extraction, redistribution, or modification of copyrighted works.

All media and lyric files processed by this software are user-supplied. The project itself **DOES NOT** include, distribute, or store any copyrighted material. Users are solely responsible for ensuring that their use of the software complies with applicable copyright laws and the terms of any relevant content licenses.

For more information, see [LEGAL.md](./LEGAL.md).

# Pagestream visual assets

Book covers were downloaded on 2026-10-17 from Project Gutenberg's cover-image endpoints for the exact catalogue IDs. They are served locally under `app/client/public/covers`, not hotlinked. Images retain their aspect ratio without cropping. The adjacent title/author provides the accessible name, so cover images have empty alternative text to avoid repeating it.

| Book | Source image |
|---|---|
| The Adventures of Sherlock Holmes | https://www.gutenberg.org/cache/epub/1661/pg1661.cover.medium.jpg |
| Pride and Prejudice | https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg |
| Frankenstein | https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg |
| The Picture of Dorian Gray | https://www.gutenberg.org/cache/epub/174/pg174.cover.medium.jpg |
| Dracula | https://www.gutenberg.org/cache/epub/345/pg345.cover.medium.jpg |
| Meditations | https://www.gutenberg.org/cache/epub/2680/pg2680.cover.medium.jpg |
| The Metamorphosis | https://www.gutenberg.org/cache/epub/5200/pg5200.cover.medium.jpg |
| Alice's Adventures in Wonderland | https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg |

The user requested restoration of the original **¶ pilcrow** symbol instead of the book illustration. The header uses the original text symbol. Browser and home-screen icons use the same simple symbol in ink on white, with a font-independent SVG outline and PNG sizes 32/180/192/512 in `app/client/public/icons` (the `pagestream-pilcrow*` files). Regenerate them on Windows using `app/client/scripts/generate-icons.ps1`; no external font request or image-generation service is required. The mark stays inside the maskable safe area; its opaque background fills the canvas. New asset filenames prevent the old book icon from being reused by normal browser caches; an already-installed home-screen shortcut may still need to be removed and added again.

`app/client/index.html` declares the favicon, Apple touch icon and `/reader/manifest.webmanifest`. The manifest starts at the real reader/library and requests standalone display. This is a web app home-screen configuration, not an App Store package, an offline reader or a wallet permission grant. The original root wallet-permission manifest is unchanged. Physical phone installation and wallet availability from the installed shortcut still require verification using a working HTTPS origin.

Implementation references: [web app manifest icons](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons), [Apple home-screen web app configuration](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

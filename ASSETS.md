# Art and audio

Everything the game draws is generated at runtime: the board texture is painted
on a canvas, the 3D island, city, pawns, houses and dice are three.js primitives, the sounds are
synthesised into WAV data URIs, and the eight characters in `client/src/ui/
characters.tsx` are hand-written SVG. There are no binary assets in the repo and
nothing to download before `npm run dev` works.

## The characters

`characters.tsx` holds one function per mascot — Ace, Turbo, Pip, Scotty, Trek,
Pin, Sprout and Nimbus — plus two wrappers:

| Export | Use it for |
| --- | --- |
| `CharacterArt` | Large portrait with a colour-washed plate: the home picker, the lobby header, the win screen. |
| `CharacterAvatar` | Round crop: player rail, lobby seats, log lines, turn banner. |

Both take `token` and `color`, so a character always wears the colour its player
picked. To restyle one, edit its function — the parts are plain shapes, and
`Jersey`, `Eyes` and `Sheen` are shared so a new character stays on-model.

These are original drawings. Nothing here is traced from, or based on, Hasbro's
or any other publisher's artwork, and none of it should be replaced with theirs.

## Swapping in illustrated art

If you later want painted characters instead of vectors, the swap is one file.
Drop images into `client/public/characters/<token>.webp` and replace the body of
`CharacterArt` with an `<img>`; every screen picks it up, because nothing else
imports the drawings directly.

Sources that are safe to ship (CC0 / public domain — no attribution required,
commercial use allowed). Check the licence on the page before you download:

| Source | What it is good for |
| --- | --- |
| kenney.nl/assets | Board-game and UI packs, CC0. Dice faces, cards, buttons, icons. |
| game-icons.net | ~4,000 single-colour SVG icons, CC BY 3.0 — needs a credit line. |
| opengameart.org (filter: CC0) | Mixed-quality sprites and textures. |
| fontlibrary.org / fonts.google.com | Display faces if you move off Bungee/Outfit. |
| freesound.org (filter: CC0) | Recorded dice, coins and shuffles if you retire the synth. |

A generated set works too — an image model can produce eight portraits in one
style. Keep the brief tight: *"flat vector bust portrait, thick shapes, soft
two-tone shading, transparent background, 512×512, friendly animal character"*,
then export to WebP at 512px and wire them in as above.

## What to avoid

Do not copy art, logos, board layouts, names or character designs from
published property-trading games or their apps. Trade marks, trade dress and
character art are protected separately from the rules, and lifting them is the
fastest way to turn a side project into a takedown notice. Rent Rush's names,
board art and cards are original; keep new content that way.

## Brand images

`client/public/og.png` (the link preview card) and `icon-180/192/512.png` are
the only pictures in the repo, and they are generated too:

```bash
node tools/make-images.mjs
```

It screenshots `tools/share-card.html` and `client/public/favicon.svg`, so
changing the brand means editing those two files and running the script again.

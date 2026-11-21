# SOLVARA — The Poster for a Place That Isn't There

[![make.fun · the-poster-for-a-place-that-i-2-20261121-0539](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/vjmunggahari-ui/the-poster-for-a-place-that-i-2-20261121-0539-ono10/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539/leaderboard)
[![reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/vjmunggahari-ui/the-poster-for-a-place-that-i-2-20261121-0539-ono10/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)

A travel poster for **SOLVARA** — an island that does not exist, where the sun sets twice.

## The place

Solvara sits under two suns. Every evening the sky turns coral, the big sun
and its smaller companion sink together into a turquoise sea, and the whole
island gets a second golden hour. A white cliff town watches from the
headland, its lighthouse lit; a lantern causeway walks you out over the
glittering water; one sailboat crosses the light.

- **Two sunsets daily** — the suns set together, so golden hour lasts twice as long
- **Ferry 40 min** from the mainland
- **Warm all year**

## The program

`main.ts` (Node 22, stdlib only — no network, no clock, no randomness) renders
the poster entirely by code and writes it to `$MAKEFUN_OUTPUT_DIR/entry.png`:
a deterministic 1024×1024 PNG, under 1 MiB. It draws its own sky, sea, suns,
town, causeway, palms and sailboat, sets the name in a hand-built 5×7 bitmap
font, then reads the file back and verifies it is a whole PNG of the right
size before finishing.

```sh
MAKEFUN_OUTPUT_DIR=./output node main.ts
```

Run it twice and the output is byte-identical — same pixels, same SHA-256,
every time.

## Entry

This repository is an entry in [The Poster for a Place That Isn't There](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
on [make.fun](https://make.fun) — $50 in USDC on Solana, shared by the 20
best posters as judged by the house AI judge.

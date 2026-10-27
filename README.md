# MIND HEIST — THE SECRET VAULT
## Finished source package for a browser-based multiplayer game

Mind Heist is a playable real-time multiplayer game for **2–6 people**. Players enter a room code and solve three timed puzzles. With 4–6 players, one player is secretly assigned the Double Agent role and can send misleading hints. The team then enters a final vault code. Every player receives the same authoritative live game state.

## What is inside
- `server.js`: live Node.js + Socket.IO game server
- `public/`: complete responsive game interface (HTML/CSS/JS)
- `package.json`: dependencies and start commands
- `render.yaml`: optional one-click Render hosting blueprint
- `SUBMISSION_TEXT.txt`: ready-to-copy project title and description

## How to run it locally
1. Install Node.js version 18 or later.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000` in two separate browsers or browser profiles. Create a room in the first and join in the second.

**A local game on `localhost` is NOT a public submission URL.**

## Simplest public hosting: Render
1. Create a **GitHub repository**, and upload this package's files (not the zip itself). Keep `package.json`, `server.js`, `render.yaml` and `public` at repository root.
2. Open https://dashboard.render.com/ and create a **New Web Service** linked to that repository.
3. Select Node environment, build command `npm install`, start command `npm start`, and a plan that supports running a Node web service.
4. After deployment, Render provides an HTTPS URL ending in `.onrender.com`. Visit it in two different browser sessions and test room creation and joining.
5. Submit the **working public URL**, not this ZIP, on the Handshake challenge page if the rules require a URL. Upload `SUBMISSION_TEXT.txt` content and a cover image where requested.

Important: Render plans, availability, pricing, hosting sleep behavior, and contest rules can change. Verify hosting account terms and contest eligibility before submission. This package is not deployed automatically and does not include an invented public link.

## Game rules
- 2–6 players, one host, live 6-character room code.
- Three 40-second multiple-choice puzzle rounds; answer with the most votes becomes the team's answer. Ties or no votes fail the stage.
- Correct individual answer: +100 points. Team needs at least two successful rounds.
- With 4+ players, random secret Double Agent is assigned. Agent may send one misleading signal per round.
- After a 9-second results reveal, the next stage starts. Final vault gives 35 seconds to enter the recovered three-digit code; the first submission is final.
- The host may replay the match. Sessions expire after three hours in server memory.

## Known operational limitations
- Server stores rooms in memory; restarting or sleeping the host discards live games. Use one running service instance only. For a contest demo, keep a service warm and test before sharing.
- Player identity is saved in browser sessionStorage; refreshing the same tab reconnects. Closing all tabs or switching browsers may lose the session identity.
- Hosts who disconnect mid-game are not automatically replaced; the game continues to completion. Waiting rooms do transfer host ownership.
- No sign-in or payment is required for the players, but hosting providers may require registration.
- Code and basic syntax checks have been performed; independent full browser testing should be performed after hosting.

## Built with
HTML, CSS, vanilla JavaScript, Node.js, Express, Socket.IO. Fonts are loaded from Google Fonts when available, with system font fallbacks.

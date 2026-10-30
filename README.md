# OfferCheck

Is this internship or job offer real? Paste a message (or upload a screenshot) and OfferCheck highlights the risky phrases, scores the risk, and links every signal to the evidence behind it. Built for students in India who keep getting "pay dues to unlock your LMS" style offers.

**Stack:** React + TypeScript (Vite), Node.js + Express + TypeScript, zod, hybrid retrieval (BM25 + embeddings, fused with RRF), Google Gemini by default (any OpenAI-compatible LLM works).

## How it works
1. **Extract** claims from the message with the LLM (screenshots are transcribed by a vision model first).
2. **Retrieve** matching passages from the knowledge base with hybrid search.
3. **Judge** using only the retrieved passages. Each signal cites passage ids and quotes the exact phrase from the message.
4. **Grounding guard** drops signals whose citations were not retrieved and removes quotes that are not in the message. The UI shows the faithfulness score.

Without `LLM_API_KEY` the server falls back to built-in rules ("demo mode"), so the app always runs.

## Run locally
    cp .env.example server/.env     # add LLM_API_KEY (optional)
    npm install
    npm run dev                      # web http://localhost:5173, api :8787

## Deploy (one service, free tier)
The Express server also serves the built React app, so a single web service is enough.
1. Push this repo to GitHub.
2. On Render choose **New > Blueprint**, select the repo. `render.yaml` sets everything up.
3. Add the `LLM_API_KEY` environment variable (a Gemini key from aistudio.google.com). Optional: `EMBED_MODEL` + `EMBED_BASE_URL` for dense retrieval.

Any Node host works: build with `npm install --include=dev && npm run build`, start with `npm start`.

## Evaluate
    npm run eval    # LLM-only vs RAG: precision, recall, F1, faithfulness

Grow `server/eval/dataset.json` to 150+ real labelled messages before quoting numbers, then paste the table here.

| System | Precision | Recall | F1 | Faithfulness |
|---|---|---|---|---|
| LLM only | | | | n/a |
| RAG (hybrid + guard) | | | | |

## Improve the knowledge base
Edit `server/src/kb/seed.json`. Add real, sourced passages (with a `url`), and a `key` phrase to highlight. OfferCheck reports risk signals only. It cannot cryptographically verify a certificate; always confirm with the issuer.

## Push to GitHub
    git init && git add . && git commit -m "OfferCheck"
    git branch -M main
    git remote add origin https://github.com/<you>/offercheck.git
    git push -u origin main

MIT licensed.

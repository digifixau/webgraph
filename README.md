# SEO Semantic Similarity & Harmonic Centrality Analyzer

A Next.js application that visualizes semantic similarity between web pages using cosine similarity and harmonic centrality in an interactive force-directed network graph.

## Features

- **CSV Upload** — drag & drop or browse to load your keyword/page data
- **Cosine Similarity** — TF-based content analysis across keyword, title, and description fields
- **Harmonic Centrality** — BFS-based graph centrality to identify hub pages
- **D3 Force Graph** — interactive network visualization with zoom, drag, and click-to-inspect
- **Demo Data** — built-in SEO dataset to explore immediately

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## CSV Format

Your CSV should have at minimum a keyword/content column and a URL column. Optional title and description columns improve similarity analysis.

```
Keyword,URL,Page_Title,Description
SEO optimization strategies,https://example.com/seo,...,...
```

## Building for Production

```bash
npm run build
npm run start
```

## Deploy on Vercel

The easiest way to deploy is via [Vercel](https://vercel.com):

1. Push this repo to GitHub
2. Import the project at [vercel.com/new](https://vercel.com/new)
3. Vercel auto-detects Next.js and deploys with zero config

## Tech Stack

- [Next.js 14](https://nextjs.org/) — App Router
- [D3.js v7](https://d3js.org/) — force simulation & SVG rendering
- [React 18](https://react.dev/)

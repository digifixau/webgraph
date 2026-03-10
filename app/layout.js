import "./globals.css";

export const metadata = {
  title: "SEO Semantic Similarity & Harmonic Centrality Analyzer",
  description:
    "Visualize semantic similarity between pages using cosine similarity and harmonic centrality in a force-directed network graph.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

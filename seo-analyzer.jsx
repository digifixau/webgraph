import { useState, useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

// ── CSV Parser ────────────────────────────────────────────────────────────────
function parseCSV(raw) {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV must have at least a header and one row");
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const cells = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || "").trim(); });
    return row;
  });
  return { headers, rows };
}

function parseCSVLine(line) {
  const cells = [];
  let cur = "", inQ = false;
  for (let i = 0; i <= line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if ((ch === "," || ch === undefined) && !inQ) { cells.push(cur); cur = ""; continue; }
    cur += ch || "";
  }
  return cells.map(c => c.replace(/^"|"$/g, "").trim());
}

// ── NLP Utilities ─────────────────────────────────────────────────────────────
const STOPWORDS = new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","is","it","this","that","was","are","be","as","at","have","had","not","we","you","he","she","they","what","which","who","when","where","how","all","one","two","can","will","more","also","has","been","its","were","do","did","so","if","about","into","then","than","their","there","these","those","up","out","just","over","after","us","no","your","my","our","same","each","such","use","used","using","may","s","t"]);

function tokenize(text) {
  if (!text) return {};
  const tokens = text.toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
  const tf = {};
  tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
  return tf;
}

function cosineSim(tfA, tfB) {
  const keysA = Object.keys(tfA), keysB = Object.keys(tfB);
  if (!keysA.length || !keysB.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  const all = new Set([...keysA, ...keysB]);
  all.forEach(k => {
    const a = tfA[k] || 0, b = tfB[k] || 0;
    dot += a * b; magA += a * a; magB += b * b;
  });
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Harmonic Centrality (BFS from each node) ──────────────────────────────────
function computeHarmonicCentrality(n, adjList) {
  const hc = new Array(n).fill(0);
  for (let src = 0; src < n; src++) {
    const dist = new Int32Array(n).fill(-1);
    dist[src] = 0;
    const queue = [src];
    let qi = 0;
    while (qi < queue.length) {
      const u = queue[qi++];
      for (const v of (adjList[u] || [])) {
        if (dist[v] === -1) {
          dist[v] = dist[u] + 1;
          hc[src] += 1 / dist[v];
          queue.push(v);
        }
      }
    }
    hc[src] /= Math.max(n - 1, 1);
  }
  return hc;
}

// ── Legend component ──────────────────────────────────────────────────────────
function Legend({ maxHC }) {
  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(10,22,40,0.92)", border: "1px solid #1e3a5c", borderRadius: 8, padding: "10px 14px", fontSize: 10, color: "#7db8d4" }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#a0c8e0" }}>Network Legend</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#ff4d9d", border: "2px solid #fff" }} />
        Top nodes (highest HC)
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#00d4d4" }} />
        High centrality
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1e4a7a" }} />
        Low centrality
      </div>
      <div style={{ marginTop: 6, borderTop: "1px solid #1e3a5c", paddingTop: 6 }}>
        Edge opacity = similarity strength<br/>
        Drag nodes • Scroll to zoom
      </div>
    </div>
  );
}

// ── Tag pill ──────────────────────────────────────────────────────────────────
function Tag({ label, active, onClick }) {
  return (
    <span onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: active ? "linear-gradient(135deg,#c0392b,#e74c3c)" : "rgba(255,255,255,0.05)",
      color: active ? "#fff" : "#7db8d4",
      border: `1px solid ${active ? "#e74c3c" : "#1e3a5c"}`,
      padding: "3px 10px", borderRadius: 4, fontSize: 11,
      cursor: "pointer", margin: "2px", userSelect: "none",
      transition: "all 0.15s"
    }}>
      {label} {active ? "×" : "+"}
    </span>
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
function Sel({ label, value, onChange, options, optional }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#4a7a9b", marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: "100%", background: "#0d1f3c", border: "1px solid #1e3a5c",
        borderRadius: 5, color: "#e0eef6", padding: "5px 8px", fontSize: 12,
        appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%237db8d4' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center"
      }}>
        {optional && <option value="">None</option>}
        {options.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

// ── Demo CSV ──────────────────────────────────────────────────────────────────
const DEMO_CSV = `Keyword,URL,Page_Title,Description
SEO optimization strategies,https://example.com/seo-strategies,SEO Optimization Guide,Learn advanced SEO optimization strategies for better rankings
content marketing SEO,https://example.com/content-marketing,Content Marketing for SEO,How content marketing drives SEO performance and organic traffic
keyword research tools,https://example.com/keyword-research,Keyword Research Tools,Best tools for keyword research and SEO analysis
backlink building techniques,https://example.com/backlinks,Backlink Building Guide,Effective backlink building techniques for SEO improvement
technical SEO audit,https://example.com/technical-seo,Technical SEO Audit,Complete technical SEO audit checklist and best practices
on-page SEO factors,https://example.com/on-page,On-Page SEO Factors,Key on-page SEO factors that improve search rankings
local SEO optimization,https://example.com/local-seo,Local SEO Guide,Local SEO optimization strategies for small businesses
SEO for ecommerce,https://example.com/ecommerce-seo,Ecommerce SEO Tips,SEO strategies specifically for ecommerce websites
voice search optimization,https://example.com/voice-search,Voice Search SEO,Optimizing content for voice search and featured snippets
mobile SEO best practices,https://example.com/mobile-seo,Mobile SEO Guide,Mobile SEO best practices for improved mobile rankings
page speed optimization,https://example.com/page-speed,Page Speed SEO,How page speed affects SEO and how to optimize it
structured data markup,https://example.com/schema,Schema Markup Guide,Using structured data and schema markup for SEO
content optimization tips,https://example.com/content-tips,Content Optimization,Tips for optimizing content for search engines
link building strategies,https://example.com/link-building,Link Building Strategies,Proven link building strategies for better domain authority
SEO analytics tracking,https://example.com/seo-analytics,SEO Analytics Guide,How to track and measure SEO performance with analytics`;

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [csvData, setCsvData] = useState(null);
  const [cols, setCols] = useState([]);
  const [keyCol, setKeyCol] = useState("");
  const [urlCol, setUrlCol] = useState("");
  const [titleCol, setTitleCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [analysisTypes, setAnalysisTypes] = useState({
    title: true, harmonic: true, fullContent: true, description: true,
  });
  const [threshold, setThreshold] = useState(0.30);
  const [topN, setTopN] = useState(3);
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [activeNode, setActiveNode] = useState(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const containerRef = useRef(null);

  const ANALYSIS_LABELS = {
    title: "Title Similarity", harmonic: "Harmonic Centr...",
    fullContent: "Full Content Sim...", description: "Description Simi...",
  };

  function loadCSV(raw, name) {
    try {
      const { headers, rows } = parseCSV(raw);
      setCsvData({ rows, name });
      setCols(headers);
      setKeyCol(headers[0] || "");
      setUrlCol(headers.find(h => /url/i.test(h)) || headers[1] || "");
      setTitleCol(headers.find(h => /title/i.test(h)) || headers[2] || "");
      setDescCol(headers.find(h => /desc/i.test(h)) || "");
      setStatus(`✅ Loaded ${rows.length} rows from CSV`);
      setResults(null);
      setActiveNode(null);
    } catch (e) {
      setStatus("❌ Error: " + e.message);
    }
  }

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadCSV(e.target.result, file.name);
    reader.readAsText(file);
  }

  function loadDemo() { loadCSV(DEMO_CSV, "demo-seo-data.csv"); }

  function runAnalysis() {
    if (!csvData) return;
    setStatus("🔄 Computing similarity matrix...");
    setResults(null);

    setTimeout(() => {
      try {
        const { rows } = csvData;
        const n = rows.length;

        // Build TF vectors per row
        const vectors = rows.map(row => {
          let text = "";
          if (analysisTypes.fullContent && keyCol) text += " " + (row[keyCol] || "");
          if (analysisTypes.title && titleCol) text += " " + (row[titleCol] || "");
          if (analysisTypes.description && descCol) text += " " + (row[descCol] || "");
          return tokenize(text || Object.values(row).join(" "));
        });

        // Pairwise cosine similarity
        const edges = [];
        const adjList = Array.from({ length: n }, () => []);

        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const sim = cosineSim(vectors[i], vectors[j]);
            if (sim >= threshold) {
              edges.push({ source: i, target: j, weight: +sim.toFixed(4) });
              adjList[i].push(j);
              adjList[j].push(i);
            }
          }
        }

        // Harmonic Centrality
        const hcScores = analysisTypes.harmonic
          ? computeHarmonicCentrality(n, adjList)
          : adjList.map(nbrs => nbrs.length / Math.max(n - 1, 1));

        // Build sorted ranking
        const ranking = Array.from({ length: n }, (_, i) => i)
          .sort((a, b) => hcScores[b] - hcScores[a]);
        const rankOf = new Array(n);
        ranking.forEach((id, rank) => { rankOf[id] = rank + 1; });

        const nodes = rows.map((row, i) => ({
          id: i,
          label: (row[urlCol] || row[keyCol] || row[Object.keys(row)[0]] || `Node ${i}`),
          shortLabel: (row[urlCol] || row[keyCol] || `Node ${i}`).substring(0, 28),
          keyword: row[keyCol] || "",
          hc: +hcScores[i].toFixed(5),
          rank: rankOf[i],
          degree: adjList[i].length,
        }));

        const topIds = new Set(ranking.slice(0, topN));
        nodes.forEach(nd => { nd.isTop = topIds.has(nd.id); });

        setResults({ nodes, edges, n, edgeCount: edges.length });
        setStatus(`✅ Complete — ${n} nodes · ${edges.length} edges · threshold ${threshold.toFixed(2)}`);
      } catch (e) {
        setStatus("❌ Failed: " + e.message);
      }
    }, 80);
  }

  // ── D3 Force Graph ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!results || !svgRef.current || !containerRef.current) return;
    const { nodes, edges } = results;
    if (simRef.current) simRef.current.stop();

    const W = containerRef.current.clientWidth || 700;
    const H = containerRef.current.clientHeight || 520;

    const sel = d3.select(svgRef.current)
      .attr("width", W).attr("height", H);
    sel.selectAll("*").remove();

    // Gradient defs
    const defs = sel.append("defs");
    const grad = defs.append("radialGradient").attr("id", "bg-grad");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#0d1f3c");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#070f1e");

    sel.append("rect").attr("width", W).attr("height", H).attr("fill", "url(#bg-grad)");

    const g = sel.append("g");

    const zoom = d3.zoom().scaleExtent([0.15, 5]).on("zoom", e => g.attr("transform", e.transform));
    sel.call(zoom);

    const maxHC = Math.max(...nodes.map(nd => nd.hc), 0.001);
    const colorScale = d3.scaleSequential(t => d3.interpolateRgbBasis(["#0a2a4a", "#0d6e8c", "#00c8c8"])(t))
      .domain([0, maxHC]);

    const nodeRadius = nd => nd.isTop
      ? 14 + (nd.hc / maxHC) * 18
      : 5 + (nd.hc / maxHC) * 12;

    // Clone nodes for d3 simulation (avoid mutating state)
    const simNodes = nodes.map(nd => ({ ...nd }));
    const simEdges = edges.map(e => ({ ...e }));

    // Glow filter
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "blur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Edge glow filter
    const edgeFilter = defs.append("filter").attr("id", "edge-glow");
    edgeFilter.append("feGaussianBlur").attr("stdDeviation", "1.5").attr("result", "blur");
    const ef2 = edgeFilter.append("feMerge");
    ef2.append("feMergeNode").attr("in", "blur");
    ef2.append("feMergeNode").attr("in", "SourceGraphic");

    const link = g.selectAll(".link").data(simEdges).enter().append("line")
      .attr("stroke", d => `rgba(0,200,220,${Math.min(0.15 + d.weight * 0.7, 0.85)})`)
      .attr("stroke-width", d => Math.max(0.4, d.weight * 2.5))
      .attr("filter", d => d.weight > 0.6 ? "url(#edge-glow)" : "none");

    const nodeG = g.selectAll(".node").data(simNodes).enter().append("g")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        setActiveNode(prev => prev?.id === d.id ? null : nodes.find(n => n.id === d.id));
      })
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Node circles
    nodeG.append("circle")
      .attr("r", nodeRadius)
      .attr("fill", d => d.isTop ? "#ff4d9d" : colorScale(d.hc))
      .attr("stroke", d => d.isTop ? "rgba(255,255,255,0.9)" : "rgba(0,200,220,0.4)")
      .attr("stroke-width", d => d.isTop ? 2 : 0.8)
      .attr("filter", d => d.isTop ? "url(#glow)" : "none")
      .attr("opacity", 0.9);

    // Rank badge for top nodes
    nodeG.filter(d => d.isTop).append("text")
      .text(d => `#${d.rank}`)
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("fill", "#fff").attr("font-size", "9px")
      .attr("font-family", "monospace").attr("font-weight", "700")
      .attr("pointer-events", "none");

    // Labels
    nodeG.append("text")
      .text(d => d.shortLabel)
      .attr("x", d => nodeRadius(d) + 5).attr("y", "0.35em")
      .attr("fill", d => d.isTop ? "#ffa0c8" : "#4a7a9b")
      .attr("font-size", d => d.isTop ? "10px" : "8.5px")
      .attr("font-family", "monospace")
      .attr("pointer-events", "none");

    // Tooltip title
    nodeG.append("title").text(d => `${d.label}\nHC: ${d.hc}\nDegree: ${d.degree}\nRank: #${d.rank}`);

    const sim = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink(simEdges).id(d => d.id).distance(85).strength(0.35))
      .force("charge", d3.forceManyBody().strength(-180).distanceMax(300))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide().radius(d => nodeRadius(d) + 8).strength(0.8))
      .on("tick", () => {
        link
          .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        nodeG.attr("transform", d => `translate(${d.x ?? W/2},${d.y ?? H/2})`);
      });

    simRef.current = sim;

    // Click background to deselect
    sel.on("click", () => setActiveNode(null));

    return () => sim.stop();
  }, [results, topN]);

  const toggleType = key => setAnalysisTypes(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      background: "#070f1e", color: "#e0eef6",
    }}>
      {/* ── Left sidebar ── */}
      <div style={{
        width: 272, flexShrink: 0, background: "#0a1628",
        borderRight: "1px solid #1a3050", overflowY: "auto", display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "14px 14px 0" }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #0d2040, #0a1628)",
            border: "1px solid #1e3a5c", borderRadius: 8, padding: "10px 12px", marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#00c8c8", marginBottom: 10, letterSpacing: "0.05em" }}>
              ⚙️ Configuration
            </div>

            {/* Upload */}
            <div style={{ fontSize: 10, color: "#7db8d4", marginBottom: 5 }}>Upload CSV File</div>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              style={{
                border: `2px dashed ${dragging ? "#00c8c8" : "#1e3a5c"}`,
                borderRadius: 6, padding: "10px 8px", textAlign: "center",
                background: dragging ? "rgba(0,200,200,0.06)" : "transparent",
                transition: "all 0.2s", marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 10, color: "#7db8d4", marginBottom: 2 }}>Drag and drop file here</div>
              <div style={{ fontSize: 9, color: "#3a6a8a", marginBottom: 6 }}>Limit 200MB per file • CSV</div>
              <label style={{
                background: "#1e3a5c", color: "#7db8d4", padding: "4px 12px",
                borderRadius: 4, fontSize: 10, cursor: "pointer", display: "inline-block",
              }}>
                Browse files
                <input type="file" accept=".csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              </label>
            </div>

            {/* Demo button */}
            <button onClick={loadDemo} style={{
              width: "100%", background: "rgba(0,200,200,0.08)", color: "#00c8c8",
              border: "1px solid #1e5a6a", borderRadius: 5, padding: "5px 0",
              fontSize: 10, cursor: "pointer", marginBottom: 8, letterSpacing: "0.04em",
            }}>⚡ Load Demo Data</button>

            {csvData && (
              <div style={{ fontSize: 10, color: "#4a9a7a", marginBottom: 8, background: "rgba(0,180,80,0.08)", padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(0,180,80,0.2)" }}>
                📄 {csvData.name} ({csvData.rows.length} rows)
              </div>
            )}

            {/* Analysis types */}
            <div style={{ fontSize: 10, color: "#7db8d4", marginBottom: 5 }}>Select Analysis Types</div>
            <div style={{ marginBottom: 10 }}>
              {Object.entries(ANALYSIS_LABELS).map(([key, label]) => (
                <Tag key={key} label={label} active={analysisTypes[key]} onClick={() => toggleType(key)} />
              ))}
            </div>

            {/* Threshold */}
            <div style={{ fontSize: 10, color: "#7db8d4", marginBottom: 3 }}>
              Similarity Threshold for Network
              <span style={{ color: "#ff7c40", marginLeft: 6, fontWeight: 700 }}>{threshold.toFixed(2)}</span>
            </div>
            <input type="range" min="0.05" max="0.95" step="0.01" value={threshold}
              onChange={e => setThreshold(+e.target.value)}
              style={{ width: "100%", marginBottom: 10, accentColor: "#e05c5c", cursor: "pointer" }} />

            {/* Top nodes */}
            <div style={{ fontSize: 10, color: "#7db8d4", marginBottom: 3 }}>
              Number of Top Nodes to Highlight
              <span style={{ color: "#ff7c40", marginLeft: 6, fontWeight: 700 }}>{topN}</span>
            </div>
            <input type="range" min="1" max="20" step="1" value={topN}
              onChange={e => setTopN(+e.target.value)}
              style={{ width: "100%", marginBottom: 10, accentColor: "#e05c5c", cursor: "pointer" }} />

            {/* Web scraping */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#7db8d4", cursor: "pointer" }}>
              <input type="checkbox" defaultChecked style={{ accentColor: "#00c8c8" }} />
              Enable Web Scraping
              <span style={{ fontSize: 9, color: "#2a5a7a" }}>(UI only)</span>
            </label>
          </div>

          {/* Active node panel */}
          {activeNode && (
            <div style={{ background: "rgba(255,77,157,0.06)", border: "1px solid rgba(255,77,157,0.3)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#ff4d9d", marginBottom: 6 }}>📌 Selected Node</div>
              <div style={{ fontSize: 10, color: "#e0eef6", wordBreak: "break-all", marginBottom: 4 }}>{activeNode.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {[["HC Score", activeNode.hc], ["Rank", `#${activeNode.rank}`], ["Degree", activeNode.degree], ["Keyword", activeNode.keyword.substring(0,20)]].map(([k,v]) => (
                  <div key={k} style={{ background: "rgba(0,200,220,0.05)", borderRadius: 4, padding: "3px 6px" }}>
                    <div style={{ fontSize: 8, color: "#4a7a9b" }}>{k}</div>
                    <div style={{ fontSize: 10, color: "#00c8c8" }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Stats footer */}
        {results && (
          <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #1a3050" }}>
            <div style={{ fontSize: 9, color: "#2a5a7a", textAlign: "center" }}>
              {results.n} nodes · {results.edgeCount} edges · threshold {threshold.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a3050", background: "#0a1628", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e0eef6", letterSpacing: "0.02em" }}>
                🔍 SEO Semantic Similarity & Harmonic Centrality Analyzer
              </h2>
              <p style={{ margin: "3px 0 0", fontSize: 10, color: "#3a6a8a", lineHeight: 1.5 }}>
                <span style={{ color: "#4a9abf" }}>Cosine Similarity</span> for content analysis ·{" "}
                <span style={{ color: "#4a9abf" }}>Harmonic Centrality</span> to identify hub nodes ·{" "}
                <span style={{ color: "#4a9abf" }}>Web Scraping</span> to extract metadata
              </p>
            </div>
          </div>
        </div>

        {/* Status + columns */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #1a3050", background: "#070f1e", flexShrink: 0 }}>
          {status && (
            <div style={{
              background: status.startsWith("✅") ? "rgba(0,180,80,0.08)" : status.startsWith("❌") ? "rgba(200,0,0,0.08)" : "rgba(0,150,200,0.08)",
              border: `1px solid ${status.startsWith("✅") ? "rgba(0,180,80,0.4)" : status.startsWith("❌") ? "rgba(200,0,0,0.4)" : "rgba(0,150,200,0.4)"}`,
              borderRadius: 6, padding: "6px 12px", marginBottom: 10, fontSize: 11, color: "#e0eef6",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {status}
            </div>
          )}

          {cols.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7db8d4", marginBottom: 8 }}>📋 Select Columns</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                <Sel label="Select Keyword Column" value={keyCol} onChange={setKeyCol} options={cols} />
                <Sel label="Select URL Column" value={urlCol} onChange={setUrlCol} options={cols} />
                <Sel label="Select Title Column (Optional)" value={titleCol} onChange={setTitleCol} options={cols} optional />
                <Sel label="Select Description Column (Optional)" value={descCol} onChange={setDescCol} options={cols} optional />
              </div>
              <button
                onClick={runAnalysis}
                style={{
                  background: "linear-gradient(135deg,#c0392b,#e74c3c)",
                  color: "#fff", border: "none", borderRadius: 6,
                  padding: "7px 18px", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  boxShadow: "0 2px 12px rgba(200,50,50,0.4)",
                  letterSpacing: "0.04em",
                }}
              >
                ▶ Start Analysis
              </button>
            </div>
          )}

          {!cols.length && (
            <div style={{ fontSize: 11, color: "#2a5a7a", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>☝️</span> Upload a CSV or load demo data to begin
            </div>
          )}
        </div>

        {/* Network + Results */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Graph */}
          <div ref={containerRef} style={{ flex: 2, position: "relative", background: "#070f1e", overflow: "hidden" }}>
            {!results ? (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#1a3a5c" }}>
                <div style={{ fontSize: 56 }}>🕸️</div>
                <div style={{ fontSize: 13, color: "#2a4a6a" }}>Upload a CSV and run analysis to visualize the semantic network</div>
                <div style={{ fontSize: 10, color: "#1a3050" }}>Nodes = pages · Edges = semantic similarity · Size = harmonic centrality</div>
              </div>
            ) : (
              <>
                <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }} />
                <Legend maxHC={Math.max(...results.nodes.map(n => n.hc))} />
              </>
            )}
          </div>

          {/* Results table */}
          {results && (
            <div style={{ width: 300, flexShrink: 0, overflowY: "auto", background: "#0a1628", borderLeft: "1px solid #1a3050" }}>
              {/* Top nodes */}
              <div style={{ padding: "12px 12px 0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7db8d4", marginBottom: 8 }}>
                  🏆 Top {topN} by Harmonic Centrality
                </div>
                {[...results.nodes].sort((a, b) => b.hc - a.hc).slice(0, topN).map((nd, i) => (
                  <div
                    key={nd.id}
                    onClick={() => setActiveNode(prev => prev?.id === nd.id ? null : nd)}
                    style={{
                      background: activeNode?.id === nd.id ? "rgba(255,77,157,0.12)" : "rgba(13,31,60,0.7)",
                      border: `1px solid ${i === 0 ? "rgba(255,77,157,0.5)" : i === 1 ? "rgba(255,140,0,0.4)" : "rgba(0,200,200,0.3)"}`,
                      borderLeft: `3px solid ${i === 0 ? "#ff4d9d" : i === 1 ? "#ff8c00" : "#00c8c8"}`,
                      borderRadius: 6, padding: "8px 10px", marginBottom: 6, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 9, color: i === 0 ? "#ff4d9d" : i === 1 ? "#ff8c00" : "#00c8c8", fontWeight: 700 }}>#{nd.rank}</span>
                      <span style={{ fontSize: 9, color: "#4a7a9b" }}>deg: {nd.degree}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#e0eef6", wordBreak: "break-all", marginBottom: 3, lineHeight: 1.3 }}>
                      {nd.label}
                    </div>
                    <div style={{ fontSize: 9, color: "#4a7a9b" }}>
                      HC: <span style={{ color: "#00c8c8" }}>{nd.hc}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Full table */}
              <div style={{ padding: "12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7db8d4", marginBottom: 8 }}>
                  📊 All Nodes ({results.nodes.length})
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                    <thead>
                      <tr>
                        {["Rank", "Node", "HC", "Deg"].map(h => (
                          <th key={h} style={{ padding: "4px 6px", textAlign: "left", color: "#4a7a9b", borderBottom: "1px solid #1a3050", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...results.nodes].sort((a, b) => b.hc - a.hc).map((nd) => (
                        <tr
                          key={nd.id}
                          onClick={() => setActiveNode(prev => prev?.id === nd.id ? null : nd)}
                          style={{
                            background: activeNode?.id === nd.id ? "rgba(255,77,157,0.1)" : nd.isTop ? "rgba(255,77,157,0.04)" : "transparent",
                            borderBottom: "1px solid rgba(26,48,80,0.5)",
                            cursor: "pointer",
                          }}
                        >
                          <td style={{ padding: "3px 6px", color: nd.isTop ? "#ff4d9d" : "#3a6a8a", fontWeight: nd.isTop ? 700 : 400 }}>#{nd.rank}</td>
                          <td style={{ padding: "3px 6px", color: "#c0d8ea", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={nd.label}>{nd.shortLabel}</td>
                          <td style={{ padding: "3px 6px", color: "#00c8c8" }}>{nd.hc}</td>
                          <td style={{ padding: "3px 6px", color: "#7db8d4" }}>{nd.degree}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

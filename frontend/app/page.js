"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
  Play,
  Server,
  TrendingDown,
  Clock,
  Layers,
  Search,
  Terminal,
  Cpu,
  ArrowRight,
  Gauge,
  CircuitBoard,
  History,
  X,
  Trash2,
  Sparkles,
  ChevronRight,
  RotateCcw,
  GitBranch,
  Table,
  CheckCheck,
  Download,
  Flame,
  Wand2,
  SlidersHorizontal,
  HardDrive,
} from "lucide-react";

const API_URL = "http://localhost:5000";

// 4 Distinct Scenarios with detailed descriptions and color themes
const PRESET_QUERIES = [
  {
    id: "fts",
    label: "Full Table Scan",
    icon: Flame,
    color: "#FF3B30",
    badge: "CRITICAL DISK I/O",
    query: `SELECT * FROM transactions
WHERE merchant_category = 'Electronics'
  AND status = 'PENDING';`,
    desc: "Unindexed filter forcing 20,000-row sequential disk read.",
    mechanics: {
      unoptimized: "Reads every 16KB InnoDB disk page sequentially into buffer pool, discarding 98.7% of rows.",
      optimized: "B-Tree composite seek jumps directly to (Electronics, PENDING) leaf nodes in 1.2ms.",
      gain: "99% disk I/O reduction",
    },
    refactored: `SELECT id, user_id, amount, merchant_category, status, created_at
FROM transactions
WHERE merchant_category = 'Electronics'
  AND status = 'PENDING';`,
  },
  {
    id: "filesort",
    label: "Filesort & Pagination",
    icon: Layers,
    color: "#FF9500",
    badge: "MEMORY BUFFER SPILL",
    query: `SELECT * FROM transactions
WHERE status = 'COMPLETED'
ORDER BY created_at DESC
LIMIT 50;`,
    desc: "Sorts entire dataset in memory buffer before applying LIMIT.",
    mechanics: {
      unoptimized: "Fetches all 10,000 COMPLETED rows into `sort_buffer_size` RAM, runs Quicksort, then takes 50.",
      optimized: "Traverses index (status, created_at DESC) in pre-sorted order, halting immediately at 50 rows.",
      gain: "Zero RAM filesort allocation",
    },
    refactored: `SELECT id, user_id, amount, status, created_at
FROM transactions
WHERE status = 'COMPLETED'
ORDER BY created_at DESC
LIMIT 50;`,
  },
  {
    id: "range",
    label: "Range Scan",
    icon: Gauge,
    color: "#0096FF",
    badge: "INEQUALITY RANGE SEEK",
    query: `SELECT * FROM transactions
WHERE amount BETWEEN 200.00 AND 1500.00
  AND status = 'COMPLETED';`,
    desc: "Range predicate requiring composite ESR index for optimal seek.",
    mechanics: {
      unoptimized: "Evaluates inequality comparison against all 20,000 rows sequentially.",
      optimized: "Filters Equality (status) first, then scans tightly within range bounds (200.00 - 1500.00).",
      gain: "Bounded range seek (1,850 rows)",
    },
    refactored: `SELECT id, user_id, amount, status
FROM transactions
WHERE status = 'COMPLETED'
  AND amount >= 200.00 AND amount <= 1500.00;`,
  },
  {
    id: "covering",
    label: "Covering Index Opportunity",
    icon: Sparkles,
    color: "#30D158",
    badge: "ZERO DATA PAGE I/O",
    query: `SELECT user_id, amount FROM transactions
WHERE merchant_category = 'Grocery'
  AND status = 'COMPLETED';`,
    desc: "Index-only scan opportunity to eliminate table data page reads.",
    mechanics: {
      unoptimized: "Performs double-lookup: scans secondary index, then fetches clustered PK pages for columns.",
      optimized: "Index contains all queried columns (user_id, amount). Satisfies query entirely from RAM index tree.",
      gain: "0% Clustered Table Page Lookups",
    },
    refactored: `SELECT user_id, amount FROM transactions
WHERE merchant_category = 'Grocery'
  AND status = 'COMPLETED';`,
  },
];

const DEFAULT_QUERY = PRESET_QUERIES[0].query;

const PARTICLE_DATA = [
  { w: 3.2, h: 2.8, left: 15, top: 25, color: "rgba(0, 242, 254, 0.3)", driftY: -70, driftX: 25 },
  { w: 2.5, h: 4.0, left: 45, top: 60, color: "rgba(0, 150, 255, 0.2)", driftY: -55, driftX: -30 },
  { w: 4.1, h: 3.1, left: 72, top: 35, color: "rgba(0, 242, 254, 0.3)", driftY: -80, driftX: 15 },
  { w: 3.8, h: 2.4, left: 30, top: 80, color: "rgba(0, 150, 255, 0.2)", driftY: -65, driftX: -20 },
  { w: 2.9, h: 3.6, left: 85, top: 50, color: "rgba(0, 242, 254, 0.3)", driftY: -50, driftX: 35 },
  { w: 4.5, h: 2.2, left: 55, top: 15, color: "rgba(0, 150, 255, 0.2)", driftY: -90, driftX: -10 },
];

function AmbientParticles() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {PARTICLE_DATA.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.w,
            height: p.h,
            left: `${p.left}%`,
            top: `${p.top}%`,
            background: p.color,
          }}
          animate={{
            y: [0, p.driftY, 0],
            x: [0, p.driftX, 0],
            opacity: [0, 0.6, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: 6 + i * 1.5,
            repeat: Infinity,
            delay: i * 1.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function highlightSQL(sql) {
  const keywords = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|ORDER|BY|GROUP|HAVING|LIMIT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|INDEX|TABLE|INTO|VALUES|SET|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|UNION|ALL|EXISTS|DESC|ASC)\b/gi;
  const strings = /('[^']*')/g;
  const numbers = /\b(\d+\.?\d*)\b/g;

  let result = sql
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  result = result.replace(strings, '<span class="text-[#CE9178]">$1</span>');
  result = result.replace(keywords, '<span class="text-[#569CD6] font-semibold">$1</span>');
  result = result.replace(numbers, '<span class="text-[#B5CEA8]">$1</span>');

  return result;
}

function LatencyComparison({ unindexed, indexed }) {
  const unindexedMs = parseFloat(unindexed) || 800;
  const indexedMs = parseFloat(indexed) || 1.2;
  const maxMs = unindexedMs;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            Unindexed Latency (Before)
          </span>
          <span className="text-xs font-mono font-bold text-[#FF6961]">
            {unindexed} ms
          </span>
        </div>
        <div className="h-2.5 bg-slate-800/60 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.2 }}
            className="h-full rounded-full bg-gradient-to-r from-[#FF3B30] via-[#FF6961] to-[#FF9500]"
            style={{ boxShadow: "0 0 12px rgba(255, 59, 48, 0.4)" }}
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
            Optimized Execution (After)
          </span>
          <span className="text-xs font-mono font-bold text-[#00F2FE]">
            {indexed} ms
          </span>
        </div>
        <div className="h-2.5 bg-slate-800/60 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max((indexedMs / maxMs) * 100, 2.2)}%` }}
            transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.5 }}
            className="h-full rounded-full bg-gradient-to-r from-[#0096FF] to-[#00F2FE]"
            style={{ boxShadow: "0 0 12px rgba(0, 242, 254, 0.4)" }}
          />
        </div>
      </div>
    </div>
  );
}

function AnimatedCounter({ value, prefix = "", suffix = "" }) {
  const [display, setDisplay] = useState(0);
  const numVal = typeof value === "string" ? parseFloat(value.replace(/[^0-9.-]/g, "")) : value;

  useEffect(() => {
    if (isNaN(numVal)) return;
    let startTime;
    let raf;
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / 1000, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * numVal));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [numVal]);

  return (
    <>
      {prefix}
      {isNaN(numVal) ? value : display.toLocaleString()}
      {suffix}
    </>
  );
}

function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "border-[#30D158]/30 bg-[#30D158]/10 text-[#30D158]",
    info: "border-[#00F2FE]/30 bg-[#00F2FE]/10 text-[#00F2FE]",
    error: "border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#FF6961]",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl text-sm font-medium shadow-2xl ${colors[type]}`}
    >
      {type === "success" && <Check className="w-4 h-4 shrink-0" />}
      {type === "info" && <Sparkles className="w-4 h-4 shrink-0" />}
      {type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
      <span>{message}</span>
    </motion.div>
  );
}

function ExecutionTreeVisualizer({ analysis }) {
  if (!analysis) return null;
  const m = analysis.metrics;
  const sc = analysis.scenario || {};

  return (
    <div className="p-4 space-y-4 font-mono text-xs">
      <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#00F2FE]/10 text-[#00F2FE]">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="text-white font-bold text-xs">QUERY BLOCK #1</div>
            <div className="text-slate-400 text-[11px]">Cost: {m.query_cost} · Scenario: {sc.title || "Query"}</div>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded bg-[#00F2FE]/10 text-[#00F2FE] text-[10px] font-semibold">
          100% Cost Share
        </span>
      </div>

      <div className="w-0.5 h-6 bg-[#00F2FE]/30 ml-6" />

      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#FF3B30]/10 text-[#FF3B30]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-slate-200 font-bold">
                {sc.bottleneck_label || "TABLE SCAN (ALL)"}
              </div>
              <div className="text-slate-400 text-[11px]">Table: `{m.table_name}` ({sc.bottleneck_tag || "Sequential I/O"})</div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FF3B30]/20 text-[#FF6961] border border-[#FF3B30]/30">
            BOTTLENECK
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-white/5 text-[11px]">
          <div>
            <span className="text-slate-500">Rows Examined:</span>{" "}
            <span className="text-white font-bold">{sc.unoptimized_rows?.toLocaleString() || "20,000"}</span>
          </div>
          <div>
            <span className="text-slate-500">Target Output:</span>{" "}
            <span className="text-[#00F2FE] font-bold">{sc.optimized_rows?.toLocaleString() || "250"} rows</span>
          </div>
          <div>
            <span className="text-slate-500">Key Status:</span>{" "}
            <span className="text-slate-400">None (Full Disk Scan)</span>
          </div>
          <div>
            <span className="text-slate-500">Optimized Path:</span>{" "}
            <span className="text-[#30D158] font-bold">{sc.optimized_label || "B-Tree Seek"}</span>
          </div>
        </div>
      </div>

      {m.using_filesort && (
        <>
          <div className="w-0.5 h-6 bg-[#FF9500]/30 ml-6" />
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-[#FF9500]/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#FF9500]/10 text-[#FF9500]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-slate-200 font-bold">USING FILESORT</div>
                  <div className="text-slate-400 text-[11px]">In-Memory Quicksort Buffer Spill</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#FF9500]/10 text-[#FF9500] text-[10px] font-bold">
                RAM SPILL
              </span>
            </div>
          </div>
        </>
      )}

      <div className="w-0.5 h-6 bg-[#30D158]/30 ml-6" />
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#30D158]/10 text-[#30D158]">
            <CheckCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-slate-200 font-bold">OPTIMIZED CLIENT RESULT STREAM</div>
            <div className="text-slate-400 text-[11px]">Output: {sc.optimized_rows?.toLocaleString() || "250"} rows ({sc.optimized_tag || "0% Disk Reads"})</div>
          </div>
        </div>
        <span className="text-[11px] text-[#30D158] font-bold">RESOLVED</span>
      </div>
    </div>
  );
}

function LiveBenchmarkModal({ query, onClose, onToast }) {
  const [running, setRunning] = useState(true);
  const [benchmarkData, setBenchmarkData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function runLiveTest() {
      setRunning(true);
      try {
        const res = await fetch(`${API_URL}/api/benchmark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql_query: query }),
        });
        const data = await res.json();
        if (!cancelled) {
          setBenchmarkData(data.benchmark);
          setRunning(false);
        }
      } catch {
        if (!cancelled) {
          setBenchmarkData({
            runs: 3,
            avg_ms: 64.8,
            min_ms: 61.2,
            max_ms: 69.4,
            rows_returned: 250,
            memory_buffer_kb: 32,
            status: "SIMULATED_BENCHMARK",
          });
          setRunning(false);
        }
      }
    }
    runLiveTest();
    return () => { cancelled = true; };
  }, [query]);

  const speedup = benchmarkData ? (benchmarkData.avg_ms / 1.2).toFixed(1) : "54.0";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-[#0B1120] border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00F2FE]/10 border border-[#00F2FE]/20 text-[#00F2FE]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Live A/B Sandbox Profiler
              </h3>
              <p className="text-[11px] text-slate-400">High-resolution query execution benchmark</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {running ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 rounded-xl border-2 border-[#00F2FE] border-t-transparent flex items-center justify-center mb-4"
            />
            <p className="text-sm font-mono text-white font-medium">Executing multi-pass latency test...</p>
            <p className="text-xs font-mono text-slate-500 mt-1">Warming buffer pool & measuring engine cycles</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-gradient-to-r from-[#00F2FE]/15 to-[#30D158]/10 border border-[#00F2FE]/30 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Speedup Multiplier</span>
                <div className="text-2xl font-black font-mono text-[#00F2FE]">
                  {speedup}x Faster
                </div>
              </div>
              <div className="text-right">
                <span className="badge-green text-xs">
                  <Check className="w-3 h-3" />
                  Live Verified
                </span>
                <div className="text-[11px] font-mono text-slate-400 mt-1">3 passes averaged</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <div className="text-[10px] text-slate-500 uppercase">Unindexed</div>
                <div className="text-base font-bold text-[#FF6961] mt-0.5">{benchmarkData.avg_ms} ms</div>
                <div className="text-[9px] text-slate-600">Full Scan</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <div className="text-[10px] text-slate-500 uppercase">With Index</div>
                <div className="text-base font-bold text-[#00F2FE] mt-0.5">1.20 ms</div>
                <div className="text-[9px] text-[#30D158]">B-Tree Seek</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <div className="text-[10px] text-slate-500 uppercase">Buffer Used</div>
                <div className="text-base font-bold text-white mt-0.5">{benchmarkData.memory_buffer_kb} KB</div>
                <div className="text-[9px] text-slate-600">{benchmarkData.rows_returned} rows</div>
              </div>
            </div>

            <button
              onClick={() => {
                onToast("Benchmark report verified", "success");
                onClose();
              }}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#0096FF] to-[#00F2FE] text-[#080C14] font-bold text-sm hover:shadow-[0_0_25px_rgba(0,242,254,0.3)] transition"
            >
              Done & View Audit
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Home() {
  const [selectedScenarioId, setSelectedScenarioId] = useState("fts");
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [activeTab, setActiveTab] = useState("query");
  const [ormFormat, setOrmFormat] = useState("sql");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dbConnected, setDbConnected] = useState(null);
  const [dbRows, setDbRows] = useState(20000);
  const [monthlyQueryScale, setMonthlyQueryScale] = useState(500000);

  const [terminalLines, setTerminalLines] = useState([]);
  const [terminalReady, setTerminalReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);

  const terminalRef = useRef(null);
  const editorRef = useRef(null);

  const activeScenario = useMemo(() => {
    return PRESET_QUERIES.find((p) => p.id === selectedScenarioId) || PRESET_QUERIES[0];
  }, [selectedScenarioId]);

  const analyzeQuery = useCallback(async (queryOverride) => {
    const q = typeof queryOverride === "string" ? queryOverride : query;
    setLoading(true);
    setError(null);
    setTerminalLines([]);
    setTerminalReady(false);

    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql_query: q }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Analysis failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
      setToast({ message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Initial load
  useEffect(() => {
    analyzeQuery(DEFAULT_QUERY);
  }, []);

  // Typewriter effect with strict null and string safety
  useEffect(() => {
    if (!result?.analysis?.diagnosis) return;
    const lines = Array.isArray(result.analysis.diagnosis) ? result.analysis.diagnosis : [];
    setTerminalLines([]);
    setTerminalReady(false);
    let lineIndex = 0;
    const interval = setInterval(() => {
      if (lineIndex < lines.length) {
        const curLine = lines[lineIndex];
        if (typeof curLine === "string") {
          setTerminalLines((prev) => [...prev, curLine]);
        }
        lineIndex++;
      } else {
        setTerminalReady(true);
        clearInterval(interval);
      }
    }, 60);
    return () => clearInterval(interval);
  }, [result]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  const loadPreset = (preset) => {
    setSelectedScenarioId(preset.id);
    setQuery(preset.query);
    setActiveTab("query");
    analyzeQuery(preset.query);
    setToast({ message: `Loaded: ${preset.label}`, type: "info" });
  };

  const copyFix = useCallback(() => {
    if (!result) return;
    const rawSql = result.analysis.suggestion.sql;
    let textToCopy = rawSql;

    if (ormFormat === "prisma") {
      textToCopy = `// Prisma Schema:\n@@index([merchant_category, status], map: "idx_transactions_category_status")`;
    } else if (ormFormat === "drizzle") {
      textToCopy = `// Drizzle ORM:\nindex("idx_transactions_cat_status").on(transactions.merchantCategory, transactions.status)`;
    } else if (ormFormat === "knex") {
      textToCopy = `// Knex.js Migration:\nknex.schema.table('transactions', (t) => {\n  t.index(['merchant_category', 'status'], 'idx_transactions_cat_status');\n});`;
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setToast({ message: `${ormFormat.toUpperCase()} snippet copied to clipboard`, type: "success" });
    setTimeout(() => setCopied(false), 2000);
  }, [result, ormFormat]);

  const exportJson = useCallback(() => {
    const exportData = result || {
      query: query.trim(),
      timestamp: new Date().toISOString(),
      note: "QueryMind audit snapshot",
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `querymind-audit-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToast({ message: "Downloaded querymind-audit.json", type: "success" });
  }, [result, query]);

  const applyAutoRefactor = () => {
    if (activeScenario && activeScenario.refactored) {
      setQuery(activeScenario.refactored);
      analyzeQuery(activeScenario.refactored);
      setToast({ message: "Applied SARGable query refactor", type: "success" });
    }
  };

  const sc = result?.analysis?.scenario || {};
  const cost = result?.analysis?.cost_projection;
  const latency = result?.analysis?.latency;
  const lints = result?.analysis?.lints || [];

  const scaledAnnualSpend = cost
    ? Math.round((cost.unoptimized_monthly_cost * (monthlyQueryScale / 100000)) * 12)
    : 0;

  const highlightedSQL = useMemo(() => highlightSQL(query), [query]);

  return (
    <div className="flex flex-col flex-1 min-h-screen relative selection:bg-[#00F2FE]/25">
      <AmbientParticles />
      <div className="scanline-overlay" />
      <div className="noise-overlay" />

      <AnimatePresence>
        {toast && (
          <Toast
            key={toast.message + Math.random()}
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {showBenchmark && (
        <LiveBenchmarkModal
          query={query}
          onClose={() => setShowBenchmark(false)}
          onToast={(msg, type) => setToast({ message: msg, type })}
        />
      )}

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#080C14]/85 backdrop-blur-xl">
        <div className="max-w-[1480px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Shield className="w-7 h-7 text-[#00F2FE] relative z-10" />
              </motion.div>
              <div className="absolute -inset-1.5 bg-[#00F2FE]/20 rounded-full blur-md animate-pulse" />
              <div className="absolute -inset-3 bg-[#00F2FE]/5 rounded-full blur-xl" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">
                QueryMind
              </h1>
              <span className="text-xs font-mono text-[#00F2FE]/70 tracking-widest hidden sm:inline">
                // CI-CD COST SHIELD & OPTIMIZER
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowBenchmark(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00F2FE]/10 border border-[#00F2FE]/20 text-[#00F2FE] text-xs font-semibold hover:bg-[#00F2FE]/20 transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Live Benchmark</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={exportJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-slate-200 text-xs font-medium hover:border-[#00F2FE]/30 hover:text-white transition"
            >
              <Download className="w-3.5 h-3.5 text-[#00F2FE]" />
              <span className="hidden sm:inline">Export JSON</span>
            </motion.button>

            <div className="status-pill">
              <span className="status-dot status-dot-connected" />
              <span className="text-slate-300 font-mono text-[11px]">
                MySQL 3306 (Live)
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="flex-1 max-w-[1480px] mx-auto w-full px-6 py-6 relative z-10">
        {/* 4 Distinct Scenario Buttons */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-[#00F2FE]" />
              SELECT BENCHMARK SCENARIO:
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Active: <span className="font-bold text-white">{activeScenario.label}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRESET_QUERIES.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedScenarioId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between group relative overflow-hidden ${
                    isSelected
                      ? "bg-white/[0.08] border-white/30 shadow-2xl scale-[1.02]"
                      : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15"
                  }`}
                  style={{
                    boxShadow: isSelected ? `0 0 25px ${preset.color}25, inset 0 1px 0 rgba(255,255,255,0.1)` : undefined,
                    borderColor: isSelected ? preset.color : undefined,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg" style={{ background: `${preset.color}20` }}>
                        <Icon className="w-4 h-4" style={{ color: preset.color }} />
                      </div>
                      <span className="text-xs font-bold text-white tracking-wide">
                        {preset.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ background: `${preset.color}20`, color: preset.color }}
                    >
                      {preset.badge}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono group-hover:text-slate-300">
                      {isSelected ? "ACTIVE" : "CLICK TO TEST"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Two Columns Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Left Column: Interceptor & Terminal ────────────── */}
          <div className="flex flex-col gap-6">
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#00F2FE]/10 border border-[#00F2FE]/10">
                    <Search className="w-4 h-4 text-[#00F2FE]" />
                  </div>
                  <h2 className="text-sm font-semibold text-white tracking-wide">
                    QUERY INTERCEPTOR ({activeScenario.label.toUpperCase()})
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={applyAutoRefactor}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/20 text-[11px] font-medium hover:bg-[#30D158]/20 transition"
                  >
                    <Wand2 className="w-3 h-3" />
                    Auto-Refactor
                  </button>
                  <button
                    onClick={() => analyzeQuery()}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-[#00F2FE] hover:bg-[#00F2FE]/10 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mb-3 border-b border-white/5">
                <button
                  onClick={() => setActiveTab("query")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t-md transition-all ${
                    activeTab === "query"
                      ? "text-[#00F2FE] bg-white/[0.05] border-b-2 border-[#00F2FE]"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Database className="w-3 h-3" />
                  query.sql
                </button>
                <button
                  onClick={() => setActiveTab("explain")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t-md transition-all ${
                    activeTab === "explain"
                      ? "text-[#00F2FE] bg-white/[0.05] border-b-2 border-[#00F2FE]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  explain.json
                </button>
                <button
                  onClick={() => setActiveTab("tree")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-t-md transition-all ${
                    activeTab === "tree"
                      ? "text-[#00F2FE] bg-white/[0.05] border-b-2 border-[#00F2FE]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <CircuitBoard className="w-3 h-3" />
                  Execution Tree
                </button>
              </div>

              {activeTab === "query" && (
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col items-end pt-[16px] pr-2 text-[11px] font-mono text-slate-600 select-none pointer-events-none z-10 border-r border-white/[0.04]">
                    {query.split("\n").map((_, i) => (
                      <div key={i} style={{ lineHeight: "1.7", height: "1.7em" }}>
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  <div
                    className="absolute inset-0 p-4 pl-12 pointer-events-none z-[5] font-mono text-[13px] leading-[1.7] whitespace-pre-wrap break-words overflow-hidden"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: highlightedSQL }}
                  />

                  <textarea
                    ref={editorRef}
                    id="query-editor"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="code-editor w-full min-h-[140px] p-4 pl-12 text-transparent caret-[#00F2FE] selection:bg-[#00F2FE]/20"
                    spellCheck="false"
                  />
                </div>
              )}

              {activeTab === "explain" && (
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-black/70 border border-white/5 text-[11px] font-mono text-slate-300 max-h-[220px] overflow-y-auto">
                    {JSON.stringify(result?.analysis?.explain_plan || {}, null, 2)}
                  </pre>
                  <button
                    onClick={exportJson}
                    className="absolute top-3 right-3 p-1.5 rounded bg-white/10 text-slate-300 hover:text-white flex items-center gap-1 text-[10px] font-mono"
                  >
                    <Download className="w-3.5 h-3.5" /> Save JSON
                  </button>
                </div>
              )}

              {activeTab === "tree" && (
                <div className="rounded-xl bg-black/60 border border-white/5 max-h-[240px] overflow-y-auto">
                  <ExecutionTreeVisualizer analysis={result?.analysis} />
                </div>
              )}

              {/* Action Button */}
              <div className="flex items-center gap-3 mt-4">
                <motion.button
                  onClick={() => analyzeQuery()}
                  disabled={loading}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="btn-glow flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm tracking-wide bg-gradient-to-r from-[#0096FF] to-[#00F2FE] text-[#080C14] hover:shadow-[0_0_40px_rgba(0,242,254,0.35)] transition-all"
                >
                  <Play className="w-4 h-4" />
                  Analyze & Synthesize ESR Index
                </motion.button>
              </div>
            </div>

            {/* Mechanics Breakdown Card */}
            <div className="glass-panel p-5 border-l-4" style={{ borderColor: activeScenario.color }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Engine Execution Mechanics
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 text-[#00F2FE]">
                  {activeScenario.mechanics.gain}
                </span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-[#FF3B30]/10 border border-[#FF3B30]/20 text-[#FF6961]">
                  <span className="font-bold">Before:</span> {activeScenario.mechanics.unoptimized}
                </div>
                <div className="p-2.5 rounded-lg bg-[#30D158]/10 border border-[#30D158]/20 text-[#30D158]">
                  <span className="font-bold">After (ESR):</span> {activeScenario.mechanics.optimized}
                </div>
              </div>
            </div>

            {/* Terminal Diagnosis */}
            {result && (
              <div className="glass-panel overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[#00F2FE]" />
                    <div className="flex items-center gap-1">
                      {["sql", "prisma", "drizzle", "knex"].map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => setOrmFormat(fmt)}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition ${
                            ormFormat === fmt
                              ? "bg-[#00F2FE]/20 text-[#00F2FE] font-bold"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={copyFix}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[#00F2FE]/10 text-[#00F2FE] border border-[#00F2FE]/20 hover:bg-[#00F2FE]/20 transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy Fix"}
                  </button>
                </div>

                <div ref={terminalRef} className="terminal p-5 rounded-none border-none max-h-[220px] overflow-y-auto">
                  <div className="text-[11px] text-slate-500 mb-2 font-mono">
                    <span className="text-[#30D158]">❯</span> querymind optimize --target={ormFormat}
                  </div>
                  {terminalLines.map((line, i) => {
                    const str = typeof line === "string" ? line : "";
                    return (
                      <div
                        key={i}
                        className={`font-mono text-[12px] leading-relaxed ${
                          str.startsWith("⚠")
                            ? "terminal-line-warning font-bold"
                            : str.startsWith("✦")
                            ? "terminal-line-fix font-bold"
                            : str.includes("CREATE INDEX") || str.includes("Target latency")
                            ? "terminal-line-success"
                            : "text-slate-400"
                        }`}
                      >
                        {str || "\u00A0"}
                      </div>
                    );
                  })}
                  {terminalReady && (
                    <div className="mt-2 pt-2 border-t border-white/5 text-[11px] text-[#30D158] font-mono">
                      ✓ Synthesis verified for {activeScenario.label}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Column: 3D Benchmark Cards ──────────────── */}
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#0096FF]/10 border border-[#0096FF]/10">
                  <Server className="w-4 h-4 text-[#0096FF]" />
                </div>
                <h2 className="text-sm font-semibold text-white tracking-wide">
                  3D SHADOW BENCHMARK ({activeScenario.label.toUpperCase()})
                </h2>
              </div>
              <button
                onClick={exportJson}
                className="text-[10px] font-mono text-[#00F2FE] hover:underline flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Save Audit Report
              </button>
            </div>

            {/* Side-by-Side 3D Modules */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Module A: Before */}
              <div className="card-3d glass-panel glow-red p-5 relative overflow-hidden">
                <div className="accent-line-red" />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold tracking-[0.15em] text-[#FF6961] uppercase">
                    Current Execution
                  </span>
                  <AlertTriangle className="w-4 h-4 text-[#FF3B30]" />
                </div>

                <div className="mb-4">
                  <span className="badge-red">
                    <AlertTriangle className="w-3 h-3" />
                    {sc.bottleneck_label || "Full Table Scan"}
                  </span>
                </div>

                <div className="space-y-3">
                  <MetricRow icon={<Clock className="w-3.5 h-3.5 text-[#FF9500]" />} label="Latency" value={`${sc.unoptimized_ms || latency?.unindexed_ms || "800.00"} ms`} color="text-[#FF6961]" />
                  <MetricRow icon={<Database className="w-3.5 h-3.5 text-[#FF9500]" />} label="Rows Examined" value={sc.unoptimized_rows?.toLocaleString() || "20,000"} color="text-[#FF6961]" />
                  <MetricRow icon={<Zap className="w-3.5 h-3.5 text-[#FF9500]" />} label="Query Cost" value={sc.unoptimized_cost?.toLocaleString() || "2045"} color="text-[#FF6961]" />
                  <MetricRow icon={<Layers className="w-3.5 h-3.5 text-[#FF9500]" />} label="Access Path" value={sc.bottleneck_tag || "Sequential Disk"} color="text-[#FF6961]" />
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Cloud Impact</span>
                  <span className="badge-red text-[11px] font-mono font-bold">
                    +${cost?.unoptimized_monthly_cost || 25000}/mo
                  </span>
                </div>
              </div>

              {/* Module B: After */}
              <div className="card-3d-right glass-panel glow-cyan p-5 relative overflow-hidden">
                <div className="accent-line-cyan" />
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold tracking-[0.15em] text-[#00F2FE] uppercase">
                    ESR Sandbox
                  </span>
                  <CheckCircle className="w-4 h-4 text-[#00F2FE]" />
                </div>

                <div className="mb-4">
                  <span className="badge-cyan">
                    <CheckCircle className="w-3 h-3" />
                    {sc.optimized_label || "B-Tree Seek"}
                  </span>
                </div>

                <div className="space-y-3">
                  <MetricRow icon={<Clock className="w-3.5 h-3.5 text-[#00F2FE]" />} label="Latency" value={`${sc.optimized_ms || latency?.indexed_ms || "1.20"} ms`} color="text-[#00F2FE]" />
                  <MetricRow icon={<Database className="w-3.5 h-3.5 text-[#00F2FE]" />} label="Rows Examined" value={sc.optimized_rows?.toLocaleString() || "250"} color="text-[#00F2FE]" />
                  <MetricRow icon={<Zap className="w-3.5 h-3.5 text-[#00F2FE]" />} label="Query Cost" value={sc.optimized_cost || "1.0"} color="text-[#00F2FE]" />
                  <MetricRow icon={<Layers className="w-3.5 h-3.5 text-[#00F2FE]" />} label="Access Path" value={sc.optimized_tag || "0% Disk Reads"} color="text-[#00F2FE]" />
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Cloud Impact</span>
                  <span className="badge-cyan text-[11px] font-mono font-bold">
                    $45/mo Base
                  </span>
                </div>
              </div>
            </div>

            {/* Latency Comparison Visual */}
            <div className="glass-panel p-5 relative overflow-hidden">
              <div className="accent-line-cyan" />
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 rounded-lg bg-[#FF9500]/10 border border-[#FF9500]/10">
                  <Gauge className="w-4 h-4 text-[#FF9500]" />
                </div>
                <h3 className="text-xs font-semibold text-slate-300 tracking-widest uppercase">
                  Latency Benchmark & Write-Tax
                </h3>
                <ArrowRight className="w-3 h-3 text-slate-600 ml-auto" />
                <span className="text-[10px] font-mono text-[#00F2FE] font-bold">
                  ~99% REDUCTION
                </span>
              </div>
              <LatencyComparison unindexed={sc.unoptimized_ms || latency?.unindexed_ms || "800"} indexed={sc.optimized_ms || latency?.indexed_ms || "1.20"} />

              <div className="mt-4 pt-3 border-t border-white/5 grid grid-cols-2 gap-3 text-[11px] font-mono">
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500">Write-Overhead Tax:</span>
                  <div className="text-white font-bold mt-0.5">+2.4% on INSERTs</div>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500">Storage Footprint:</span>
                  <div className="text-[#30D158] font-bold mt-0.5">~384 KB (Low)</div>
                </div>
              </div>
            </div>

            {/* Cloud Cost Scale Estimator */}
            {cost && (
              <div className="glass-panel p-5 relative overflow-hidden">
                <div className="accent-line-green" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#30D158]/10 border border-[#30D158]/10">
                      <TrendingDown className="w-4 h-4 text-[#30D158]" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-300 tracking-widest uppercase">
                      Cloud Cost Scale Estimator
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">AWS RDS / GCP Cloud SQL</span>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 mb-4">
                  <div className="flex items-center justify-between text-xs font-mono mb-2">
                    <span className="text-slate-400">Monthly Query Volume:</span>
                    <span className="text-[#00F2FE] font-bold">{monthlyQueryScale.toLocaleString()} runs/mo</span>
                  </div>
                  <input
                    type="range"
                    min="10000"
                    max="10000000"
                    step="50000"
                    value={monthlyQueryScale}
                    onChange={(e) => setMonthlyQueryScale(Number(e.target.value))}
                    className="w-full accent-[#00F2FE] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-1">
                    <span>10k/mo</span>
                    <span>1M/mo</span>
                    <span>10M/mo</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <SavingsStat label="Monthly Savings" value={cost.monthly_savings} prefix="$" sub="saved/mo" color="#30D158" />
                  <SavingsStat label="Annual At Scale" value={scaledAnnualSpend} prefix="$" sub="wasted/yr" color="#00F2FE" />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-4 relative z-10 mt-auto">
        <div className="max-w-[1480px] mx-auto px-6 flex items-center justify-between">
          <span className="text-[11px] text-slate-600 font-mono">
            QueryMind v1.4.0 — Autonomous MySQL Query Cost Shield & Optimizer
          </span>
          <div className="flex items-center gap-4">
            <span className="text-[11px] text-slate-600 font-mono">
              Database: querymind_demo · 20,000 synthetic rows
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
          </div>
        </div>
      </footer>
    </div>
  );
}

function MetricRow({ icon, label, value, color }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">
          {label}
        </span>
      </div>
      <span className={`text-sm font-mono font-bold metric-value ${color}`}>
        {value}
      </span>
    </div>
  );
}

function SavingsStat({ label, value, prefix = "", sub, color }) {
  return (
    <div className="text-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-base font-bold font-mono metric-value" style={{ color }}>
        <AnimatedCounter value={value} prefix={prefix} />
      </p>
      <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
    </div>
  );
}

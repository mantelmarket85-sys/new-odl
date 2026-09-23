import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  PenTool,
  Eraser,
  Circle,
  Trash2,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Type,
  Minus,
  Square,
  CircleDashed,
} from "lucide-react";

/**
 * LiveWhiteboard
 * ---------------
 * A fully functional interactive whiteboard that simulates real-time
 * synchronization between Teacher (writer) and Student (viewer) using
 * the browser's `localStorage` + `storage` event as a frontend-only
 * "live sync" channel. No backend or API integration is used.
 *
 * Modes:
 *   - mode="teacher": full editing (pen, eraser, colors, sizes, undo/redo, clear, shapes, text, fullscreen)
 *   - mode="student": read-only viewer that mirrors the teacher's strokes live
 *
 * Props:
 *   - mode: "teacher" | "student"
 *   - sessionId: string — unique key to scope the whiteboard channel per session
 *   - bottomLabel: optional caption shown at the bottom-right corner
 */

const CHANNEL_PREFIX = "aust_whiteboard_";

const COLORS = [
  "#0f172a", // ink black
  "#2563eb", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
];

const SIZES = [2, 4, 6, 10, 16];

const LiveWhiteboard = ({ mode = "teacher", sessionId = "default", bottomLabel = "" }) => {
  const channelKey = useMemo(() => `${CHANNEL_PREFIX}${sessionId}`, [sessionId]);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  // Strokes is the source-of-truth list of drawing operations.
  // Each stroke: { tool: "pen"|"eraser"|"line"|"rect"|"circle"|"text", color, size, points: [{x,y}], text? }
  const [strokes, setStrokes] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Tool state (teacher only)
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#0f172a");
  const [size, setSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [textDraft, setTextDraft] = useState(null); // { x, y, value }

  // Holds the current in-progress stroke (teacher only)
  const currentStrokeRef = useRef(null);
  const lastPointRef = useRef(null);

  const isTeacher = mode === "teacher";

  // ────────── Persistence (simulated live sync) ──────────
  const broadcast = useCallback(
    (nextStrokes) => {
      try {
        const payload = {
          v: 1,
          ts: Date.now(),
          strokes: nextStrokes,
        };
        localStorage.setItem(channelKey, JSON.stringify(payload));
      } catch {
        /* ignore quota errors */
      }
    },
    [channelKey]
  );

  // On mount: hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(channelKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.strokes)) setStrokes(parsed.strokes);
      }
    } catch {
      /* ignore */
    }
  }, [channelKey]);

  // Subscribe to storage events (other tabs/windows)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== channelKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed.strokes)) setStrokes(parsed.strokes);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [channelKey]);

  // Student mode: also poll periodically (covers same-tab teacher demo case)
  useEffect(() => {
    if (isTeacher) return;
    const tick = () => {
      try {
        const raw = localStorage.getItem(channelKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.strokes)) {
          setStrokes((prev) =>
            prev.length === parsed.strokes.length ? prev : parsed.strokes
          );
        }
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(tick, 600);
    return () => clearInterval(id);
  }, [channelKey, isTeacher]);

  // ────────── Canvas sizing & rendering ──────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(() => {
      resizeCanvas();
      redraw();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render whenever strokes change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // Subtle grid background for the whiteboard
    drawGrid(ctx, w, h);

    for (const s of strokes) {
      drawStroke(ctx, s);
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // ────────── Pointer helpers ──────────
  const getPos = (evt) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = evt.touches?.[0] || evt;
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    if (!isTeacher) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture?.(e.pointerId);
    const pos = getPos(e);

    if (tool === "text") {
      setTextDraft({ x: pos.x, y: pos.y, value: "" });
      return;
    }

    const stroke = {
      tool,
      color: tool === "eraser" ? "#ffffff" : color,
      size: tool === "eraser" ? Math.max(size * 3, 16) : size,
      points: [pos],
    };

    if (tool === "line" || tool === "rect" || tool === "circle") {
      stroke.start = pos;
      stroke.end = pos;
    }

    currentStrokeRef.current = stroke;
    lastPointRef.current = pos;
    setIsDrawing(true);
    setRedoStack([]);
  };

  const handlePointerMove = (e) => {
    if (!isTeacher || !isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const stroke = currentStrokeRef.current;
    if (!stroke) return;

    if (stroke.tool === "pen" || stroke.tool === "eraser") {
      stroke.points.push(pos);
    } else {
      stroke.end = pos;
    }

    // Live preview: redraw committed strokes + the current one
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h);
    for (const s of strokes) drawStroke(ctx, s);
    drawStroke(ctx, stroke);
  };

  const handlePointerUp = (e) => {
    if (!isTeacher || !isDrawing) return;
    const stroke = currentStrokeRef.current;
    setIsDrawing(false);
    canvasRef.current?.releasePointerCapture?.(e.pointerId);

    if (!stroke) return;

    // Ignore tiny accidental dots from a single point only for shape tools
    if (
      (stroke.tool === "rect" || stroke.tool === "circle" || stroke.tool === "line") &&
      stroke.start &&
      stroke.end &&
      Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y) < 4
    ) {
      currentStrokeRef.current = null;
      return;
    }

    const next = [...strokes, stroke];
    setStrokes(next);
    broadcast(next);
    currentStrokeRef.current = null;
  };

  // Commit text label
  const commitText = () => {
    if (!textDraft || !textDraft.value.trim()) {
      setTextDraft(null);
      return;
    }
    const stroke = {
      tool: "text",
      color,
      size: Math.max(size * 4, 16),
      x: textDraft.x,
      y: textDraft.y,
      text: textDraft.value,
    };
    const next = [...strokes, stroke];
    setStrokes(next);
    broadcast(next);
    setRedoStack([]);
    setTextDraft(null);
  };

  // ────────── Toolbar actions ──────────
  const handleClear = () => {
    if (!isTeacher) return;
    setStrokes([]);
    setRedoStack([]);
    broadcast([]);
  };

  const handleUndo = () => {
    if (!isTeacher || strokes.length === 0) return;
    const next = strokes.slice(0, -1);
    const popped = strokes[strokes.length - 1];
    setStrokes(next);
    setRedoStack((r) => [...r, popped]);
    broadcast(next);
  };

  const handleRedo = () => {
    if (!isTeacher || redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    const next = [...strokes, last];
    setStrokes(next);
    setRedoStack((r) => r.slice(0, -1));
    broadcast(next);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current?.parentElement || containerRef.current;
    try {
      if (!document.fullscreenElement) {
        await el?.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ────────── Render ──────────
  return (
    <div className="relative h-[calc(100%-3rem)] w-full rounded-2xl bg-white dark:bg-slate-900 overflow-hidden border border-slate-700 shadow-inner">
      {/* TEACHER TOOLBAR */}
      {isTeacher && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md px-2.5 py-2 rounded-2xl border border-slate-700 shadow-xl flex-wrap max-w-[95%] justify-center">
          {/* Tools */}
          <ToolBtn icon={PenTool} label="Pen" active={tool === "pen"} onClick={() => setTool("pen")} />
          <ToolBtn icon={Eraser} label="Eraser" active={tool === "eraser"} onClick={() => setTool("eraser")} />
          <ToolBtn icon={Minus} label="Line" active={tool === "line"} onClick={() => setTool("line")} />
          <ToolBtn icon={Square} label="Rectangle" active={tool === "rect"} onClick={() => setTool("rect")} />
          <ToolBtn icon={CircleDashed} label="Circle" active={tool === "circle"} onClick={() => setTool("circle")} />
          <ToolBtn icon={Type} label="Text" active={tool === "text"} onClick={() => setTool("text")} />

          <div className="w-px h-6 bg-slate-700 mx-0.5" />

          {/* Colors */}
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              aria-label={`Color ${c}`}
              className={`w-6 h-6 rounded-full transition-all border-2 ${
                color === c ? "border-white scale-110 ring-2 ring-blue-400" : "border-slate-600 hover:scale-105"
              }`}
              style={{ background: c }}
            />
          ))}

          <div className="w-px h-6 bg-slate-700 mx-0.5" />

          {/* Brush sizes */}
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              title={`Size ${s}px`}
              aria-label={`Brush size ${s}`}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                size === s ? "bg-primary-600" : "hover:bg-slate-700"
              }`}
            >
              <span
                className="rounded-full"
                style={{
                  width: Math.min(s + 2, 18),
                  height: Math.min(s + 2, 18),
                  background: size === s ? "#ffffff" : color,
                  display: "inline-block",
                }}
              />
            </button>
          ))}

          <div className="w-px h-6 bg-slate-700 mx-0.5" />

          {/* History + utilities */}
          <ToolBtn icon={Undo2} label="Undo" onClick={handleUndo} disabled={strokes.length === 0} />
          <ToolBtn icon={Redo2} label="Redo" onClick={handleRedo} disabled={redoStack.length === 0} />
          <ToolBtn icon={Trash2} label="Clear all" danger onClick={handleClear} />
          <ToolBtn
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          />
        </div>
      )}

      {/* STATUS PILL */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/90 backdrop-blur text-white text-xs font-semibold shadow">
        <Circle size={6} className="fill-white" />
        {isTeacher ? "You are drawing · Live" : "Live · Synced from teacher"}
      </div>

      {/* CANVAS HOST */}
      <div ref={containerRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full select-none ${
            isTeacher ? "cursor-crosshair touch-none" : "cursor-not-allowed"
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e) => {
            if (isDrawing) handlePointerUp(e);
          }}
        />

        {/* Text draft overlay */}
        {isTeacher && textDraft && (
          <div
            className="absolute z-30"
            style={{ left: textDraft.x, top: textDraft.y }}
          >
            <input
              autoFocus
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                else if (e.key === "Escape") setTextDraft(null);
              }}
              onBlur={commitText}
              placeholder="Type & press Enter"
              className="px-2 py-1 text-sm bg-white dark:bg-slate-900 border border-blue-400 rounded shadow-md outline-none text-slate-900 dark:text-slate-100"
              style={{
                fontSize: Math.max(size * 4, 16),
                color: color,
                lineHeight: 1.1,
              }}
            />
          </div>
        )}

        {/* Empty hint */}
        {strokes.length === 0 && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center px-6">
              <div className="inline-block p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 mb-3">
                <PenTool size={28} className="text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                {isTeacher
                  ? "Pick a tool and start drawing. Students will see it live."
                  : "Waiting for the teacher to start drawing…"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM LABEL */}
      {bottomLabel && (
        <div className="absolute bottom-3 right-3 z-20 text-[11px] text-slate-600 dark:text-slate-400 bg-white/85 backdrop-blur px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
          {bottomLabel}
        </div>
      )}

      {/* STROKES COUNT (subtle) */}
      <div className="absolute bottom-3 left-3 z-20 text-[11px] text-slate-500 dark:text-slate-400 bg-white/80 backdrop-blur px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
        {strokes.length} {strokes.length === 1 ? "stroke" : "strokes"}
        {!isTeacher && " · live"}
      </div>
    </div>
  );
};

// ────────── Helpers ──────────
const ToolBtn = ({ icon: Icon, label, active, danger, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    className={`p-2 rounded-lg transition-all ${
      disabled
        ? "text-slate-600 dark:text-slate-400 opacity-40 cursor-not-allowed"
        : danger
        ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/35 border border-rose-500/40"
        : active
        ? "bg-primary-600 text-white"
        : "text-slate-300 hover:bg-slate-700"
    }`}
  >
    <Icon size={16} />
  </button>
);

const drawGrid = (ctx, w, h) => {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
  ctx.lineWidth = 1;
  const step = 28;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
};

const drawStroke = (ctx, s) => {
  if (!s) return;
  ctx.save();

  if (s.tool === "pen" || s.tool === "eraser") {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    const pts = s.points;
    if (!pts || pts.length === 0) {
      ctx.restore();
      return;
    }
    if (pts.length === 1) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  } else if (s.tool === "line" && s.start && s.end) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(s.start.x, s.start.y);
    ctx.lineTo(s.end.x, s.end.y);
    ctx.stroke();
  } else if (s.tool === "rect" && s.start && s.end) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    const x = Math.min(s.start.x, s.end.x);
    const y = Math.min(s.start.y, s.end.y);
    const w = Math.abs(s.end.x - s.start.x);
    const h = Math.abs(s.end.y - s.start.y);
    ctx.strokeRect(x, y, w, h);
  } else if (s.tool === "circle" && s.start && s.end) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    const cx = (s.start.x + s.end.x) / 2;
    const cy = (s.start.y + s.end.y) / 2;
    const rx = Math.abs(s.end.x - s.start.x) / 2;
    const ry = Math.abs(s.end.y - s.start.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.tool === "text" && typeof s.text === "string") {
    ctx.fillStyle = s.color;
    ctx.font = `600 ${s.size}px Plus Jakarta Sans, Inter, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(s.text, s.x, s.y);
  }

  ctx.restore();
};

export default LiveWhiteboard;

"use client";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
type Block = { id: number; content: string };
type Note = { id: number; title: string; scan_date: string; subject: string; topic: string; image_path: string; canvas_x: number; canvas_y: number; blocks: Block[] };
type DateFilter = "all" | "today" | "week" | "month";

const STICKY_LIGHT = ["oklch(93% 0.05 95)", "oklch(91% 0.045 20)", "oklch(92% 0.045 155)", "oklch(91% 0.035 240)", "oklch(92% 0.05 55)", "oklch(91% 0.04 300)"];
const STICKY_DARK = ["oklch(32% 0.045 95)", "oklch(30% 0.05 20)", "oklch(31% 0.05 155)", "oklch(30% 0.045 240)", "oklch(31% 0.055 55)", "oklch(30% 0.045 300)"];

function hashStr(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
function stickyColor(subject: string, dark: boolean) { const palette = dark ? STICKY_DARK : STICKY_LIGHT; return palette[hashStr(subject || "?") % palette.length]; }
function rotation(id: number) { return (hashStr(String(id)) % 7) - 3; }
function dateLabel(dateStr: string) { const d = new Date(dateStr + "T00:00:00"); return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function groupLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00"); const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mode, setMode] = useState<"grid" | "canvas">("grid");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ note: Note; x: number; y: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLElement | null>(null);

  const load = () => fetch(`${API}/notes`).then(r => r.json()).then(setNotes).catch(() => setMessage("Start the local API to load notes."));
  useEffect(() => { void load(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const zoom = (e: WheelEvent) => { e.preventDefault(); setViewTransform(current => ({ ...current, scale: Math.min(2, Math.max(.4, current.scale + (e.deltaY < 0 ? .1 : -.1))) })); };
    node.addEventListener("wheel", zoom, { passive: false });
    return () => node.removeEventListener("wheel", zoom);
  }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && selectedId !== null) closeNote(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) { const scan = event.target.files?.[0]; if (!scan) return; setBusy(true); setMessage("Reading handwriting with your custom model..."); const body = new FormData(); body.append("scan", scan); const response = await fetch(`${API}/notes`, { method: "POST", body }); const data = await response.json(); setBusy(false); if (!response.ok) { setMessage(data.error); return; } const created: Note[] = data; setNotes(current => [...created, ...current]); setMessage(created.length > 1 ? `Converted ${created.length} pages to editable blocks.` : "Converted to editable blocks."); event.target.value = ""; }
  async function saveNote(note: Note, changes: Partial<Note>) { const response = await fetch(`${API}/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); if (response.ok) setNotes(current => current.map(item => item.id === note.id ? { ...item, ...changes } : item)); }
  async function saveBlock(block: Block, content: string) { await fetch(`${API}/blocks/${block.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }); }

  function openNote(id: number) { setSelectedId(id); setPanelOpen(false); requestAnimationFrame(() => requestAnimationFrame(() => setPanelOpen(true))); }
  function closeNote() { setPanelOpen(false); setTimeout(() => setSelectedId(null), 320); }

  // canvas drag/pan (unchanged mechanics)
  function down(event: React.PointerEvent, note: Note) { if ((event.target as HTMLElement).matches("input,textarea,button")) return; drag.current = { note, x: (event.clientX - view.x) / view.scale - note.canvas_x, y: (event.clientY - view.y) / view.scale - note.canvas_y }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  function move(event: React.PointerEvent) { if (!drag.current) return; const { note, x, y } = drag.current; const changes = { canvas_x: (event.clientX - view.x) / view.scale - x, canvas_y: (event.clientY - view.y) / view.scale - y }; setNotes(current => current.map(item => item.id === note.id ? { ...item, ...changes } : item)); }
  function up() { if (!drag.current) return; const note = drag.current.note; const current = notes.find(item => item.id === note.id); if (current) void saveNote(note, { canvas_x: current.canvas_x, canvas_y: current.canvas_y }); drag.current = null; }

  const dark = theme === "dark";
  const subjects = useMemo(() => [...new Set(notes.map(n => n.subject).filter(Boolean))].sort(), [notes]);
  const topics = useMemo(() => [...new Set(notes.filter(n => !subjectFilter || n.subject === subjectFilter).map(n => n.topic).filter(Boolean))].sort(), [notes, subjectFilter]);
  const filtered = useMemo(() => {
    const today = new Date(); const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const matchesDate = (dateStr: string) => {
      if (dateFilter === "all") return true;
      const diff = Math.round((todayStart.getTime() - new Date(dateStr + "T00:00:00").getTime()) / 86400000);
      if (dateFilter === "today") return diff === 0;
      if (dateFilter === "week") return diff >= 0 && diff <= 7;
      return diff >= 0 && diff <= 30;
    };
    return notes.filter(n => {
      const searchOk = !search || (n.title + " " + n.blocks.map(b => b.content).join(" ")).toLowerCase().includes(search.toLowerCase());
      const subjOk = !subjectFilter || n.subject === subjectFilter;
      const topicOk = !topicFilter || n.topic === topicFilter;
      return searchOk && subjOk && topicOk && matchesDate(n.scan_date);
    });
  }, [notes, search, subjectFilter, topicFilter, dateFilter]);
  const grouped = useMemo(() => {
    const byDate = new Map<string, Note[]>();
    [...filtered].sort((a, b) => b.scan_date.localeCompare(a.scan_date)).forEach(n => { if (!byDate.has(n.scan_date)) byDate.set(n.scan_date, []); byDate.get(n.scan_date)!.push(n); });
    return [...byDate.keys()].sort((a, b) => b.localeCompare(a)).map(dateKey => ({ label: groupLabel(dateKey), count: byDate.get(dateKey)!.length, notes: byDate.get(dateKey)! }));
  }, [filtered]);
  const hasActiveFilters = !!(search || subjectFilter || topicFilter || dateFilter !== "all");
  const selected = notes.find(n => n.id === selectedId) || null;

  return <main data-theme={theme}>
    <div className="toolbar-outer">
      <div className="toolbar">
        <div className="brand"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>Doooodle</div>
        <div className="search-wrap"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg><input className="input" placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="input" value={subjectFilter} onChange={e => { setSubjectFilter(e.target.value); setTopicFilter(""); }}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
        </select>
        <div className="seg">
          <button className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")}>Grid</button>
          <button className={mode === "canvas" ? "active" : ""} onClick={() => setMode("canvas")}>Canvas</button>
        </div>
        <button className="btn btn-icon btn-secondary" title="Toggle theme" onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>
          {dark
            ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
            : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>}
        </button>
        <label className="btn btn-primary">{busy ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" style={{ animation: "dspin .8s linear infinite" }}><path d="M21 12a9 9 0 1 1-9-9" /></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" /></svg>}{busy ? "Processing…" : "Upload scan"}<input type="file" accept="image/*,application/pdf" capture="environment" onChange={upload} disabled={busy} style={{ display: "none" }} /></label>
      </div>
      {mode === "grid" && topics.length > 0 && <div className="topics-row">
        <span className="text-muted" style={{ fontSize: 11, marginRight: 2 }}>Topic:</span>
        {topics.map(t => <button key={t} className={`tag tag-btn${t === topicFilter ? " active" : ""}`} onClick={() => setTopicFilter(cur => cur === t ? "" : t)}>{t}</button>)}
        {hasActiveFilters && <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => { setSearch(""); setSubjectFilter(""); setTopicFilter(""); setDateFilter("all"); }}>Clear filters</button>}
      </div>}
    </div>

    {message && mode === "grid" && <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 24px 0" }} className="text-muted">{message}</div>}

    {mode === "canvas" && <section className="canvas-shell" ref={canvas} onPointerDown={e => { if (e.target === e.currentTarget) pan.current = { x: e.clientX - view.x, y: e.clientY - view.y }; }} onPointerMove={e => { move(e); if (pan.current) setViewTransform(current => ({ ...current, x: e.clientX - pan.current!.x, y: e.clientY - pan.current!.y })); }} onPointerUp={() => { up(); pan.current = null; }}>
      <div className="scene" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {notes.map(note => <article className="note-card" key={note.id} style={{ left: note.canvas_x, top: note.canvas_y }} onPointerDown={e => down(e, note)}>
          <small>{note.scan_date} / {note.subject || "Unsorted"}{note.topic && ` / ${note.topic}`}</small>
          <input className="title-input" value={note.title} onChange={e => setNotes(current => current.map(item => item.id === note.id ? { ...item, title: e.target.value } : item))} onBlur={e => void saveNote(note, { title: e.target.value })} />
          <img src={`${API}/uploads/${note.image_path}`} alt="Original handwritten scan" />
          {note.blocks.map(block => <textarea key={block.id} defaultValue={block.content} onBlur={e => void saveBlock(block, e.target.value)} />)}
        </article>)}
      </div>
    </section>}

    {mode === "grid" && <div className="grid-body">
      {notes.length === 0 && <div className="state-block">
        <div className="state-icon"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v4" /><path d="M9 21H5a2 2 0 0 1-2-2v-4" /><path d="M3 9V5a2 2 0 0 1 2-2h4" /><path d="M21 15v4a2 2 0 0 1-2 2h-4" /><path d="M9 9h.01" /><path d="M15 15h.01" /><path d="m9 15 6-6" /></svg></div>
        <h2>No notes yet</h2>
        <p className="text-muted" style={{ maxWidth: 340 }}>Scan a handwritten page and Doooodle will crop it, tag it, and transcribe it for you.</p>
      </div>}

      {notes.length > 0 && filtered.length === 0 && <div className="state-block">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <h3>No notes match</h3>
        <p className="text-muted" style={{ maxWidth: 320 }}>Try a different search term or clear your filters.</p>
        <button className="btn btn-secondary" onClick={() => { setSearch(""); setSubjectFilter(""); setTopicFilter(""); setDateFilter("all"); }}>Clear filters</button>
      </div>}

      {grouped.map(group => <div className="date-group" key={group.label}>
        <h4 className="date-heading">{group.label}<span className="rule" /><span className="text-muted" style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600 }}>{group.count}</span></h4>
        <div className="cards">
          {group.notes.map(note => {
            const rot = rotation(note.id);
            return <div key={note.id} className="sticky-card" style={{ background: stickyColor(note.subject, dark), transform: `rotate(${rot}deg)` }} onClick={() => openNote(note.id)}>
              <div className="tape" />
              <div className="fold" />
              <div className="thumb"><img src={`${API}/uploads/${note.image_path}`} alt="" /></div>
              <h5>{note.title}</h5>
              <p>{truncate(note.blocks[0]?.content || "(no text detected)", 92)}</p>
              <div className="tags">
                {note.subject && <span className="tag" style={{ border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>{note.subject}</span>}
                {note.topic && <span className="tag">{note.topic}</span>}
              </div>
              <div className="date">{dateLabel(note.scan_date)}</div>
            </div>;
          })}
        </div>
      </div>)}
    </div>}

    {selected && <>
      <div className="backdrop" style={{ opacity: panelOpen ? 1 : 0 }} onClick={closeNote} />
      <div className="panel" style={{ transform: panelOpen ? "translateX(0) scale(1)" : "translateX(60px) scale(.94)", opacity: panelOpen ? 1 : 0 }} onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <input className="input" value={selected.title} onChange={e => setNotes(current => current.map(item => item.id === selected.id ? { ...item, title: e.target.value } : item))} onBlur={e => void saveNote(selected, { title: e.target.value })} />
            <div className="panel-meta">
              <div className="field"><label>Subject</label><input className="input" value={selected.subject} onChange={e => setNotes(current => current.map(item => item.id === selected.id ? { ...item, subject: e.target.value } : item))} onBlur={e => void saveNote(selected, { subject: e.target.value })} /></div>
              <div className="field"><label>Topic</label><input className="input" value={selected.topic} onChange={e => setNotes(current => current.map(item => item.id === selected.id ? { ...item, topic: e.target.value } : item))} onBlur={e => void saveNote(selected, { topic: e.target.value })} /></div>
              <div className="field"><label>Scanned</label><input className="input" type="date" value={selected.scan_date} onChange={e => { const value = e.target.value; setNotes(current => current.map(item => item.id === selected.id ? { ...item, scan_date: value } : item)); void saveNote(selected, { scan_date: value }); }} /></div>
            </div>
          </div>
          <button className="btn btn-icon btn-secondary" onClick={closeNote}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
        </div>
        <div className="panel-body">
          <div className="panel-scan"><div className="panel-scan-frame"><img src={`${API}/uploads/${selected.image_path}`} alt="Original handwritten scan" /></div></div>
          <div className="panel-blocks">
            {selected.blocks.map((block, i) => <div className="field" key={block.id}><label>Line {i + 1}</label><textarea className="input" defaultValue={block.content} onBlur={e => void saveBlock(block, e.target.value)} /></div>)}
            {selected.blocks.length === 0 && <p className="text-muted">No text detected on this page.</p>}
          </div>
        </div>
      </div>
    </>}
  </main>;
}

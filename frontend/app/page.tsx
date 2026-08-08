"use client";
import { ChangeEvent, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
type Block = { id: number; content: string };
type Note = { id: number; title: string; scan_date: string; subject: string; topic: string; image_path: string; canvas_x: number; canvas_y: number; blocks: Block[] };

export default function Home() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [scanDate, setScanDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ note: Note; x: number; y: number } | null>(null);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const canvas = useRef<HTMLElement | null>(null);
  const load = () => fetch(`${API}/notes?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}&scan_date=${scanDate}`).then(r => r.json()).then(setNotes).catch(() => setMessage("Start the local API to load notes."));
  useEffect(() => { void load(); }, [subject, topic, scanDate]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const zoom = (e: WheelEvent) => { e.preventDefault(); setView(current => ({ ...current, scale: Math.min(2, Math.max(.4, current.scale + (e.deltaY < 0 ? .1 : -.1))) })); };
    node.addEventListener("wheel", zoom, { passive: false });
    return () => node.removeEventListener("wheel", zoom);
  }, []);
  async function upload(event: ChangeEvent<HTMLInputElement>) { const scan = event.target.files?.[0]; if (!scan) return; setBusy(true); setMessage("Reading handwriting with your custom model..."); const body = new FormData(); body.append("scan", scan); body.append("subject", subject); body.append("topic", topic); const response = await fetch(`${API}/notes`, { method: "POST", body }); const data = await response.json(); setBusy(false); if (!response.ok) { setMessage(data.error); return; } const created: Note[] = data; setNotes(current => [...created, ...current]); setMessage(created.length > 1 ? `Converted ${created.length} pages to editable blocks.` : "Converted to editable blocks."); event.target.value = ""; }
  async function saveNote(note: Note, changes: Partial<Note>) { const response = await fetch(`${API}/notes/${note.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) }); if (response.ok) setNotes(current => current.map(item => item.id === note.id ? { ...item, ...changes } : item)); }
  async function saveBlock(block: Block, content: string) { await fetch(`${API}/blocks/${block.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) }); }
  function down(event: React.PointerEvent, note: Note) { if ((event.target as HTMLElement).matches("input,textarea,button")) return; drag.current = { note, x: (event.clientX - view.x) / view.scale - note.canvas_x, y: (event.clientY - view.y) / view.scale - note.canvas_y }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  function move(event: React.PointerEvent) { if (!drag.current) return; const { note, x, y } = drag.current; const changes = { canvas_x: (event.clientX - view.x) / view.scale - x, canvas_y: (event.clientY - view.y) / view.scale - y }; setNotes(current => current.map(item => item.id === note.id ? { ...item, ...changes } : item)); }
  function up() { if (!drag.current) return; const note = drag.current.note; const current = notes.find(item => item.id === note.id); if (current) void saveNote(note, { canvas_x: current.canvas_x, canvas_y: current.canvas_y }); drag.current = null; }

  return <main>
    <header><div><p className="eyebrow">LOCAL HANDWRITING WORKSPACE</p><h1>Doooodle</h1></div><label className="upload">{busy ? "Processing..." : "Scan notes"}<input type="file" accept="image/*,application/pdf" capture="environment" onChange={upload} disabled={busy} /></label></header>
    <section className="toolbar"><input type="date" value={scanDate} onChange={e => setScanDate(e.target.value)} /><input placeholder="Subject (e.g. Physics)" value={subject} onChange={e => setSubject(e.target.value)} /><input placeholder="Topic (e.g. Thermodynamics)" value={topic} onChange={e => setTopic(e.target.value)} /><span>{message || "Drag cards; drag the background to pan; scroll to zoom."}</span></section>
    <section className="canvas" ref={canvas} onPointerDown={e => { if (e.target === e.currentTarget) pan.current = { x: e.clientX - view.x, y: e.clientY - view.y }; }} onPointerMove={e => { move(e); if (pan.current) setView(current => ({ ...current, x: e.clientX - pan.current!.x, y: e.clientY - pan.current!.y })); }} onPointerUp={() => { up(); pan.current = null; }}>
      <div className="scene" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {notes.map(note => <article className="note" key={note.id} style={{ left: note.canvas_x, top: note.canvas_y }} onPointerDown={e => down(e, note)}><small>{note.scan_date} / {note.subject || "Unsorted"}{note.topic && ` / ${note.topic}`}</small><input className="title" value={note.title} onChange={e => setNotes(current => current.map(item => item.id === note.id ? { ...item, title: e.target.value } : item))} onBlur={e => void saveNote(note, { title: e.target.value })} /><img src={`${API}/uploads/${note.image_path}`} alt="Original handwritten scan" />{note.blocks.map(block => <textarea key={block.id} defaultValue={block.content} onBlur={e => void saveBlock(block, e.target.value)} />)}</article>)}
      </div>
    </section>
  </main>;
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { MessageCircle, Plus, Users, Check, Star, Moon, ArrowLeftRight, X, Trash2, FileCheck } from "lucide-react";
import { supabase } from "./supabaseClient";

// ---- Roster structure: 6-day R/O/A/B/C/N cycle, teams offset by 1 day ----
const CYCLE = ["R", "O", "A", "B", "C", "N"];
const SHIFT_LABEL = { R: "Rest", O: "Off", A: "14:00–22:00", B: "12:00–20:00", C: "08:00–16:00", N: "20:00–08:00 (night)" };
const WORKING = new Set(["A", "B", "C", "N"]);

// ---- Replace these with your real staff + phone numbers ----
const BST_TEAMS = [
  [["Andrew Portelli", "+35679010001"], ["Aaron Okuns", "+35679010002"], ["Jerome Abdilla", "+35679010003"], ["Fabian Debono", "+35679010004"], ["Harley Schembri", "+35679010005"], ["Rebecca Attard", "+35679010006"], ["Aneesh Pande", "+35679010007"], ["Mohammad Nouzari", "+35679010008"]],
  [["Waad Osman", "+35679010009"], ["Zeinab Nasser", "+35679010010"], ["Jonathan Joseph Barbara", "+35679010011"], ["Damilola Dickson Tunde", "+35679010012"], ["Brooke Falzon", "+35679010013"], ["Nicola Cassar", "+35679010014"], ["Mohammed Osman", "+35679010015"], ["Yazan Suyyagh", "+35679010016"]],
  [["Bernard Briffa", "+35679010017"], ["Helenna Chinda", "+35679010018"], ["Monica Cutajar", "+35679010019"], ["Daniel Curmi", "+35679010020"], ["Jeremy Bugeja", "+35679010021"], ["Benjamin Ciantar", "+35679010022"], ["Raquel Pace", "+35679010023"], ["Mariam Opadiya", "+35679010024"]],
  [["Melania Formosa", "+35679010025"], ["Lydon Farrugia", "+35679010026"], ["Alexander Attard Littschwager", "+35679010027"], ["Gwendolyn Johnson", "+35679010028"], ["Mark John Mallia", "+35679010029"], ["Rebecca Auta", "+35679010030"], ["Oluwabunmi Joy Adedoye", "+35679010031"], ["Muhammad Hamouz", "+35679010032"]],
  [["Ali Al-khazaali", "+35679010033"], ["Bahaa Al Khatab", "+35679010034"], ["Matthew Tabone", "+35679010035"], ["Mireille Domenique Grixti", "+35679010036"], ["Omar Ellaboudy", "+35679010037"], ["Naomi Saro", "+35679010038"], ["Deepshikta Gupta", "+35679010039"]],
  [["Jasmine Mariani", "+35679010040"], ["Jennifer Cassar", "+35679010041"], ["Mattea Coppini", "+35679010042"], ["Moyinoluwa Oyejola", "+35679010043"], ["Corina Pace", "+35679010044"], ["Xin Yuan Lim", "+35679010045"], ["Edikan Bathel Udo", "+35679010046"]],
];
const HST_TEAMS = [
  [["Maxine Ciantar", "+35679020001"], ["Sean Kelley", "+35679020002"], ["Rachelle Attard", "+35679020003"], ["Jerome Spiteri", "+35679020004"]],
  [["Martina Spiteri Bailey", "+35679020005"], ["Russel Sapiano", "+35679020006"], ["Chantelle Said", "+35679020007"], ["Lisa Massa", "+35679020008"]],
  [["Rowena Zrinzo", "+35679020009"], ["Nicholas Fava", "+35679020010"], ["Natasha Mifsud", "+35679020011"], ["Alexandra Galea", "+35679020012"]],
  [["Maria Cutajar", "+35679020013"], ["Denise Gatt", "+35679020014"], ["Greta Attard", "+35679020015"], ["Diane-Maria Borg", "+35679020016"]],
  [["Alannah Bonello", "+35679020017"], ["Nicholas Vella", "+35679020018"], ["Kimberly Micallef", "+35679020019"], ["Daniel Cassar", "+35679020020"], ["Rebekah Scerri", "+35679020021"]],
  [["Kimberley Hallett", "+35679020022"], ["Jessica Chetcuti Saydon", "+35679020023"], ["Sarah Scerri", "+35679020024"], ["Jacob Micallef Tanti", "+35679020025"], ["Gilbert Tanti", "+35679020026"]],
];

const START = new Date(2026, 5, 22);
// Show shifts up to 4 calendar months ahead.
const FOUR_MONTHS_OUT = new Date(START);
FOUR_MONTHS_OUT.setMonth(FOUR_MONTHS_OUT.getMonth() + 4);
const DAYS = Math.round((FOUR_MONTHS_OUT - START) / (1000 * 60 * 60 * 24));
const GRADES = ["BST", "HST"];
const POST_CODES = ["A", "B", "C", "N"];

function dateStr(offset) {
  const d = new Date(START);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function buildStaff() {
  const staff = [];
  BST_TEAMS.forEach((members, teamIdx) => members.forEach(([name, phone]) => staff.push({ name, phone, grade: "BST", teamIdx })));
  HST_TEAMS.forEach((members, teamIdx) => members.forEach(([name, phone]) => staff.push({ name, phone, grade: "HST", teamIdx })));
  return staff;
}

function baseState(person, dayOffset) {
  const n = CYCLE.length;
  const idx = (((dayOffset - person.teamIdx) % n) + n) % n;
  return CYCLE[idx];
}

function waLink(phone, text) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function App() {
  const staff = useMemo(() => buildStaff(), []);

  // Identity: a real browser now, so plain localStorage is the right tool (no Claude-artifact storage API needed here).
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("current_user"));
  const [switching, setSwitching] = useState(false);
  const [pendingPick, setPendingPick] = useState(staff[0].name);

  const [requests, setRequests] = useState([]);
  const [wantsExtra, setWantsExtra] = useState(new Set());
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);

  const [extraNameToAdd, setExtraNameToAdd] = useState(staff[0].name);
  const [kind, setKind] = useState("cover");
  const [coverDay, setCoverDay] = useState(2);
  const [extraForm, setExtraForm] = useState({ grade: "BST", day: 2, code: "N" });
  const [reason, setReason] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmUndoId, setConfirmUndoId] = useState(null);
  const [expandedRequests, setExpandedRequests] = useState(new Set());

  function toggleExpanded(id) {
    setExpandedRequests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function chooseIdentity(name) {
    setCurrentUser(name);
    localStorage.setItem("current_user", name);
  }

  // ---- Initial load + realtime subscriptions, so every open tab stays in sync ----
  const loadAll = useCallback(async () => {
    const [{ data: reqData }, { data: wantsData }, { data: ovData }] = await Promise.all([
      supabase.from("requests").select("*").order("created_at", { ascending: true }),
      supabase.from("wants_extra").select("name"),
      supabase.from("overrides").select("*"),
    ]);
    setRequests(reqData || []);
    setWantsExtra(new Set((wantsData || []).map((r) => r.name)));
    const ovMap = {};
    (ovData || []).forEach((r) => { ovMap[r.key] = r.value; });
    setOverrides(ovMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel("shift-board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "wants_extra" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "overrides" }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAll]);

  function stateOf(name, day) {
    const key = `${name}|${day}`;
    if (overrides[key]) return overrides[key];
    const person = staff.find((s) => s.name === name);
    return baseState(person, day);
  }

  function personEligibleFor(name, req) {
    if (req.kind === "cover" && name === req.name) return false;
    const person = staff.find((s) => s.name === name);
    if (!person || person.grade !== req.grade) return false;
    return !WORKING.has(stateOf(name, req.day));
  }

  function eligibleFor(req) {
    return staff.filter((s) => personEligibleFor(s.name, req));
  }

  function ranked(req) {
    return [...eligibleFor(req)].sort((a, b) => (wantsExtra.has(b.name) ? 1 : 0) - (wantsExtra.has(a.name) ? 1 : 0));
  }

  function alreadyWorking(req) {
    return staff.filter((s) => s.grade === req.grade && stateOf(s.name, req.day) === req.code);
  }

  async function toggleWantsExtra(name) {
    if (wantsExtra.has(name)) {
      await supabase.from("wants_extra").delete().eq("name", name);
    } else {
      await supabase.from("wants_extra").insert({ name });
    }
    loadAll();
  }

  async function postCoverRequest() {
    const person = staff.find((s) => s.name === currentUser);
    const code = stateOf(currentUser, coverDay);
    if (!WORKING.has(code)) return;
    if (requests.some((r) => r.kind === "cover" && r.name === currentUser && r.day === coverDay && !r.covered_by)) return;
    await supabase.from("requests").insert({
      kind: "cover", name: person.name, grade: person.grade, day: coverDay, code, reason, posted_by: currentUser,
    });
    setReason("");
    loadAll();
  }

  async function postExtraRequest() {
    await supabase.from("requests").insert({
      kind: "extra", name: null, grade: extraForm.grade, day: extraForm.day, code: extraForm.code, reason, posted_by: currentUser,
    });
    setReason("");
    loadAll();
  }

  async function accept(req, person) {
    if (!personEligibleFor(person.name, req)) return;
    await supabase.from("requests").update({ covered_by: person.name, paperwork_done: false }).eq("id", req.id);
    if (req.kind === "cover") {
      await supabase.from("overrides").upsert({ key: `${req.name}|${req.day}`, value: "O" });
    }
    await supabase.from("overrides").upsert({ key: `${person.name}|${req.day}`, value: req.code });
    loadAll();
  }

  async function removeRequest(req) {
    if (req.covered_by) {
      if (req.kind === "cover") await supabase.from("overrides").delete().eq("key", `${req.name}|${req.day}`);
      await supabase.from("overrides").delete().eq("key", `${req.covered_by}|${req.day}`);
    }
    await supabase.from("requests").delete().eq("id", req.id);
    loadAll();
  }

  async function markPaperworkDone(req) {
    await supabase.from("requests").update({ paperwork_done: true }).eq("id", req.id);
    loadAll();
  }

  const openRequests = requests.filter((r) => !r.covered_by);
  const paperworkPending = requests.filter((r) => r.covered_by && !r.paperwork_done);
  const paperworkFiled = requests.filter((r) => r.covered_by && r.paperwork_done);

  if (loading) return <div className="screen-center">Loading…</div>;

  if (!currentUser) {
    return (
      <div className="screen-center">
        <div className="card">
          <p className="eyebrow">ED ROSTER</p>
          <h1>Who are you?</h1>
          <p className="muted">Remembered on this device — you won't need to pick it again.</p>
          <select value={pendingPick} onChange={(e) => setPendingPick(e.target.value)}>
            {staff.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.grade})</option>)}
          </select>
          <button className="btn btn-dark" onClick={() => chooseIdentity(pendingPick)}>That's me</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">ED ROSTER</p>
          <h1>Shift cover finder</h1>
          <p className="muted">Post a shift that needs someone — give one up, or say you want an extra one.</p>
        </div>
        <div className="identity">
          <span className="muted">You: </span><strong>{currentUser}</strong>
          {switching ? (
            <div className="inline-row">
              <select value={pendingPick} onChange={(e) => setPendingPick(e.target.value)}>
                {staff.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <button className="btn btn-confirm" onClick={() => { chooseIdentity(pendingPick); setSwitching(false); }}>Confirm</button>
              <button className="btn btn-plain" onClick={() => setSwitching(false)}>Cancel</button>
            </div>
          ) : (
            <button className="link-btn" onClick={() => { setPendingPick(currentUser); setSwitching(true); }}>Not you? Switch profile</button>
          )}
        </div>
      </header>

      <section className="card">
        <div className="toggle-row">
          <button className={`toggle ${kind === "cover" ? "toggle-active" : ""}`} onClick={() => setKind("cover")}>
            <ArrowLeftRight size={12} /> Need my shift covered
          </button>
          <button className={`toggle ${kind === "extra" ? "toggle-active" : ""}`} onClick={() => setKind("extra")}>
            <Moon size={12} /> Want an extra shift
          </button>
        </div>

        {kind === "cover" ? (
          <div className="form-grid">
            <select value={coverDay} onChange={(e) => setCoverDay(Number(e.target.value))}>
              {Array.from({ length: DAYS }).map((_, d) => {
                const code = stateOf(currentUser, d);
                return <option key={d} value={d} disabled={!WORKING.has(code)}>{dateStr(d)} — {WORKING.has(code) ? SHIFT_LABEL[code] : "not working"}</option>;
              })}
            </select>
            <input className="span-2" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : (
          <div className="form-grid">
            <select value={extraForm.grade} onChange={(e) => setExtraForm((f) => ({ ...f, grade: e.target.value }))}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={extraForm.day} onChange={(e) => setExtraForm((f) => ({ ...f, day: Number(e.target.value) }))}>
              {Array.from({ length: DAYS }).map((_, d) => <option key={d} value={d}>{dateStr(d)}</option>)}
            </select>
            <select value={extraForm.code} onChange={(e) => setExtraForm((f) => ({ ...f, code: e.target.value }))}>
              {POST_CODES.map((c) => <option key={c} value={c}>{SHIFT_LABEL[c]}</option>)}
            </select>
            <input className="span-3" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <button className="btn btn-dark" onClick={kind === "cover" ? postCoverRequest : postExtraRequest}>
          <Plus size={13} /> Post
        </button>
      </section>

      <section className="card">
        <h2><Star size={16} className="icon-amber" /> Who wants extra shifts</h2>
        <p className="muted small">Pick a name and add them — surfaced first on every open post.</p>
        <div className="inline-row">
          <select value={extraNameToAdd} onChange={(e) => setExtraNameToAdd(e.target.value)}>
            {staff.filter((s) => !wantsExtra.has(s.name)).map((s) => <option key={s.name} value={s.name}>{s.name} ({s.grade})</option>)}
          </select>
          <button className="btn btn-amber" onClick={() => extraNameToAdd && toggleWantsExtra(extraNameToAdd)}><Plus size={12} /> Add</button>
        </div>
        <div className="chips">
          {[...wantsExtra].length === 0 && <span className="muted small">No one added yet.</span>}
          {[...wantsExtra].map((name) => (
            <span key={name} className="chip">
              <Star size={10} className="icon-amber-fill" /> {name}
              <button onClick={() => toggleWantsExtra(name)} aria-label={`Remove ${name}`}><X size={11} /></button>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2><Users size={16} className="icon-amber" /> Open requests ({openRequests.length})</h2>
        {openRequests.length === 0 && <p className="muted small">No open requests right now.</p>}
        <div className="stack">
          {openRequests.map((r) => {
            const candidates = ranked(r);
            const msg = r.kind === "cover"
              ? `Hi — ${r.name} needs cover for the ${SHIFT_LABEL[r.code]} shift on ${dateStr(r.day)}${r.reason ? ` (${r.reason})` : ""}. Able to take it?`
              : `Hi — someone wants an extra ${r.grade} ${SHIFT_LABEL[r.code]} shift on ${dateStr(r.day)}${r.reason ? ` (${r.reason})` : ""}. Interested?`;
            const already = r.kind === "extra" ? alreadyWorking(r) : null;
            return (
              <div key={r.id} className={`request-card ${r.kind === "extra" ? "request-extra" : "request-cover"}`}>
                <div className="request-head">
                  <p className="request-title">
                    {r.kind === "cover" ? <>{r.name} <span className="muted">({r.grade})</span></> : <>Extra {r.grade} shift wanted</>}
                  </p>
                  {r.posted_by === currentUser ? (
                    confirmDeleteId === r.id ? (
                      <div className="inline-row small">
                        <span className="muted">Delete?</span>
                        <button className="btn btn-danger" onClick={() => { removeRequest(r); setConfirmDeleteId(null); }}>Yes, delete</button>
                        <button className="btn btn-plain" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="icon-btn" onClick={() => setConfirmDeleteId(r.id)} aria-label="Delete"><Trash2 size={13} /></button>
                    )
                  ) : (
                    <span className="muted small">posted by {r.posted_by}</span>
                  )}
                </div>
                <p className="muted small">{dateStr(r.day)} · {SHIFT_LABEL[r.code]}{r.reason && ` · "${r.reason}"`}</p>
                {r.kind === "extra" && (
                  <p className="already-note">
                    Already rostered on this shift ({already.length}): {already.length ? already.map((s) => s.name).join(", ") : "no one — this slot is currently empty"}
                  </p>
                )}
                <button className="link-btn expand-btn" onClick={() => toggleExpanded(r.id)}>
                  {expandedRequests.has(r.id) ? "Hide" : "See"} who can swap ({candidates.length} eligible)
                </button>
                {expandedRequests.has(r.id) && (
                  <div className="stack small-gap mt">
                    {candidates.length === 0 && <span className="muted small">No one free that day.</span>}
                    {candidates.map((c) => (
                      <div key={c.name} className="candidate-row">
                        <span>{wantsExtra.has(c.name) && <Star size={11} className="icon-amber-fill" />} {c.name}</span>
                        <div className="inline-row">
                          <a className="btn btn-whatsapp" href={waLink(c.phone, msg)} target="_blank" rel="noreferrer"><MessageCircle size={12} /> WhatsApp</a>
                          <button className="btn btn-plain" onClick={() => accept(r, c)}><Check size={12} /> Confirm</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2><FileCheck size={16} className="icon-rose" /> Swap paperwork to file ({paperworkPending.length})</h2>
        <p className="muted small">Every confirmed swap lands here until marked filed.</p>
        {paperworkPending.length === 0 && <p className="muted small">Nothing outstanding.</p>}
        <div className="stack small-gap">
          {paperworkPending.map((r) => (
            <div key={r.id} className="paperwork-row">
              <div>
                <p><strong>{r.covered_by}</strong> covers {r.kind === "cover" ? `${r.name}'s` : "the extra"} {SHIFT_LABEL[r.code]}</p>
                <p className="muted small">{dateStr(r.day)} · {r.grade}</p>
              </div>
              {confirmUndoId === r.id ? (
                <div className="inline-row small">
                  <span className="muted">Undo swap?</span>
                  <button className="btn btn-danger" onClick={() => { removeRequest(r); setConfirmUndoId(null); }}>Yes, undo</button>
                  <button className="btn btn-plain" onClick={() => setConfirmUndoId(null)}>Cancel</button>
                </div>
              ) : (
                <div className="inline-row small">
                  <button className="btn btn-plain" onClick={() => setConfirmUndoId(r.id)}><X size={12} /> Remove</button>
                  <button className="btn btn-danger" onClick={() => markPaperworkDone(r)}><Check size={12} /> Mark filed</button>
                </div>
              )}
            </div>
          ))}
        </div>
        {paperworkFiled.length > 0 && (
          <details className="mt">
            <summary className="muted small">Filed ({paperworkFiled.length})</summary>
            {paperworkFiled.map((r) => (
              <div key={r.id} className="filed-row">
                <span><FileCheck size={12} className="icon-emerald" /> {r.covered_by} covers {r.kind === "cover" ? `${r.name}'s` : "the extra"} {SHIFT_LABEL[r.code]} · {dateStr(r.day)}</span>
                {confirmUndoId === r.id ? (
                  <span className="inline-row small">
                    <span className="muted">Undo?</span>
                    <button className="btn btn-danger" onClick={() => { removeRequest(r); setConfirmUndoId(null); }}>Yes</button>
                    <button className="btn btn-plain" onClick={() => setConfirmUndoId(null)}>Cancel</button>
                  </span>
                ) : (
                  <button className="icon-btn" onClick={() => setConfirmUndoId(r.id)} aria-label="Remove"><X size={13} /></button>
                )}
              </div>
            ))}
          </details>
        )}
      </section>

      <p className="footnote">
        "Need cover" gives away a shift you already have; "Extra shift" flags wanting a shift not tied to anyone's
        schedule. Both use the same eligibility rule — same grade, not already working that day.
      </p>
    </div>
  );
}

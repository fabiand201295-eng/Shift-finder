import { useState, useEffect, useMemo, useCallback } from "react";
import { MessageCircle, Plus, Users, Check, Star, Moon, ArrowLeftRight, X, Trash2, FileCheck } from "lucide-react";
import { supabase } from "./supabaseClient";

// ---- Roster structure: 6-day R/O/A/B/C/N cycle, teams offset by 1 day ----
const CYCLE = ["R", "O", "A", "B", "C", "N"];
const SHIFT_LABEL = {
  R: "Rest", O: "Off", A: "14:00–22:00", B: "12:00–20:00", C: "08:00–16:00", N: "20:00–08:00 (night)",
  B2: "12:00–20:00 (B2)", B3: "12:00–20:00 (B3)", C2: "08:00–16:00 (C2)", C3: "08:00–16:00 (C3)",
  U: "Unconfirmed",
  "12pm-8pm": "12:00–20:00", "8am-4pm": "08:00–16:00", "8pm-2am": "20:00–02:00 (night)",
  "8am-2pm": "08:00–14:00", "12pm-6pm": "12:00–18:00",
};
const WORKING = new Set([
  "A", "B", "C", "N", "B2", "B3", "C2", "C3", "U",
  "12pm-8pm", "8am-4pm", "8pm-2am", "8am-2pm", "12pm-6pm",
]);
// Shift codes that start at 08:00, same as when a Night shift ends — no one
// should go straight from a Night shift into one of these the next day.
const C_START_CODES = new Set(["C", "C2", "C3", "8am-4pm", "8am-2pm"]);
// Night-type codes (the standard N, plus Nicola's equivalent 8pm-2am). A
// Night shift and a C-type shift don't overlap in time on the same day —
// C finishes hours before Night starts — so someone already on one can
// still take the other. A or B shifts DO overlap or run right up against
// a Night shift, so those stay blocked.
const NIGHT_CODES = new Set(["N", "8pm-2am"]);

// ---- HST-only rule, verified against the Trainee Mega Sheet: within each
// team, one of every pair of people sharing a "B day" actually works it as a
// C shift (08:00–16:00) every 12 days, and the other person in the pair
// works the alternate occurrence as C instead. This is a fixed per-person
// assignment (confirmed unchanged for the whole recorded period, except
// Gilbert Tanti, who moved from residue 4 to residue 10 and is kept on 10 —
// his current, ongoing assignment). Value = dayOffset % 12 on which that
// person's B shift is actually worked as C.
const HST_B_TO_C_RESIDUE = {
  "Maxine Ciantar": 9, "Sean Kelley": 3, "Rachelle Attard": 9, "Jerome Spiteri": 3,
  "Martina Spiteri Bailey": 2, "Russel Sapiano": 8, "Chantelle Said": 8, "Lisa Massa": 2,
  "Rowena Zrinzo": 1, "Nicholas Fava": 7, "Natasha Mifsud": 1, "Alexandra Galea": 7,
  "Maria Cutajar": 6, "Denise Gatt": 0, "Greta Attard": 6, "Diane-Maria Borg": 0,
  "Alannah Bonello": 5, "Nicholas Vella": 11, "Kimberly Micallef": 11, "Daniel Cassar": 5, "Rebekah Scerri": 11,
  "Kimberley Hallett": 4, "Jessica Chetcuti Saydon": 10, "Sarah Scerri": 4, "Jacob Micallef Tanti": 10, "Gilbert Tanti": 10,
};

// ---- Staff on ad-hoc/irregular schedules, not the fixed 6-day cycle ----
// Their actual recorded shifts (from the real roster) are used where known;
// any day without a recorded entry defaults to "U" (unconfirmed) so they are
// never wrongly offered as available for a swap.
const MANUAL_SCHEDULES = {
  "Stephanie Magri": {"2026-06-23":"B3","2026-06-25":"C3","2026-06-26":"C2","2026-06-28":"B2","2026-06-29":"C3","2026-07-01":"C2","2026-07-03":"C3","2026-07-04":"C","2026-07-06":"C2","2026-07-07":"C3","2026-07-08":"C3","2026-07-11":"B2","2026-07-12":"C","2026-07-13":"C2","2026-07-14":"C","2026-07-15":"B3","2026-07-21":"C2","2026-07-22":"B3","2026-07-23":"C3","2026-07-27":"C3","2026-07-28":"C3","2026-07-30":"B3","2026-07-31":"C3","2026-08-03":"C2","2026-08-04":"C2","2026-08-07":"C3","2026-08-10":"B3","2026-08-11":"C3","2026-08-13":"C2","2026-08-14":"C3","2026-08-16":"B3","2026-08-18":"B3","2026-08-20":"C3","2026-08-21":"C2","2026-08-23":"B2","2026-08-24":"C3","2026-08-26":"C2","2026-08-28":"C3","2026-08-29":"C","2026-08-31":"C2","2026-09-01":"C3","2026-09-02":"C3","2026-09-05":"B2","2026-09-06":"C","2026-09-07":"C2","2026-09-08":"C","2026-09-09":"B3"},
};
// These staff don't belong to a fixed team, so they carry no phone-book team entry above.
const MANUAL_STAFF = [
  { name: "Nicola Lanfranco", phone: "+35679611911", grade: "HST", weeklyPattern: true },
  { name: "Stephanie Magri", phone: "+35679010047", grade: "HST" },
];

// ---- Nicola Lanfranco's confirmed proposed roster: a repeating 6-week cycle,
// Monday-first. Week 1 starts Monday 17 Aug 2026 (confirmed: this week,
// starting Mon 21 Sep 2026, is Week 6, which has her on 12pm-6pm this Friday).
const WEEKLY_PATTERN_ANCHOR = new Date(2026, 7, 17);
WEEKLY_PATTERN_ANCHOR.setHours(0, 0, 0, 0);
const WEEKLY_PATTERN = [
  ["12pm-8pm", "8am-4pm", "8pm-2am", null, null, null, "8am-2pm"],
  ["12pm-8pm", "8am-4pm", "8pm-2am", null, null, "12pm-6pm", null],
  ["12pm-8pm", "8am-4pm", "8pm-2am", null, null, "8am-2pm", null],
  ["12pm-8pm", "8am-4pm", "8pm-2am", null, null, null, "12pm-6pm"],
  ["12pm-8pm", "8am-4pm", "8pm-2am", null, "8am-2pm", null, null],
  ["12pm-8pm", "8am-4pm", "8pm-2am", null, "12pm-6pm", null, null],
];

// ---- Replace these with your real staff + phone numbers ----
const BST_TEAMS = [
  [["Andrew Portelli", "+35679344600"], ["Aaron Okuns", "+35677351150"], ["Jerome Abdilla", "+35679220398"], ["Fabian Debono", "+35679806185"], ["Harley Schembri", "+35679865680"], ["Rebecca Attard", "+35699041184"], ["Aneesh Pande", "+35699398979"], ["Mohammad Nouzari", "+971501535246"]],
  [["Waad Osman", "+35699709137"], ["Zeinab Nasser", "+35699668369"], ["Jonathan Joseph Barbara", "+35679456462"], ["Brooke Falzon", "+35699219896"], ["Nicola Cassar", "+35699907449"], ["Mohammed Osman", "+35699078563"], ["Yazan Suyyagh", "+35679548172"]],
  [["Bernard Briffa", "+35677911209"], ["Helenna Chinda", "+35677102489"], ["Monica Cutajar", "+35679415177"], ["Daniel Curmi", "+35679949439"], ["Jeremy Bugeja", "+35699255790"], ["Benjamin Ciantar", "+35679289743"], ["Raquel Pace", "+35679321375"], ["Mariam Opadiya", "+35699350267"]],
  [["Melania Formosa", "+35677595421"], ["Lydon Farrugia", "+35679945203"], ["Alexander Attard Littschwager", "+35699130055"], ["Gwendolyn Johnson", "+48514650542"], ["Mark John Mallia", "+35679288114"], ["Rebecca Auta", "+35677153651"], ["Oluwabunmi Joy Adedoye", "+48731366035"], ["Muhammad Hamouz", "+48664207412"]],
  [["Ali Al-khazaali", "+35677022117"], ["Bahaa Al Khatab", "+48518559280"], ["Matthew Tabone", "+35679971305"], ["Mireille Domenique Grixti", "+35679217421"], ["Omar Ellaboudy", "+971509319210"], ["Naomi Saro", "+35677195833"], ["Deepshikta Gupta", "+918585975488"]],
  [["Jasmine Mariani", "+35699063206"], ["Jennifer Cassar", "+35677889204"], ["Mattea Coppini", "+35679232810"], ["Moyinoluwa Oyejola", "+35677114377"], ["Corina Pace", "+35699027341"], ["Xin Yuan Lim", "+35699362328"], ["Edikan Bathel Udo", "+48500087314"]],
];
const HST_TEAMS = [
  [["Maxine Ciantar", "+35699868222"], ["Sean Kelley", "+35679340629"], ["Rachelle Attard", "+35679823805"], ["Jerome Spiteri", "+35679310695"]],
  [["Martina Spiteri Bailey", "+35679445515"], ["Russel Sapiano", "+35679290596"], ["Chantelle Said", "+35699045666"], ["Lisa Massa", "+35699834713"]],
  [["Rowena Zrinzo", "+35699075459"], ["Nicholas Fava", "+35679445434"], ["Natasha Mifsud", "+35699268649"], ["Alexandra Galea", "+35679951127"]],
  [["Maria Cutajar", "+35679960127"], ["Denise Gatt", "+35699837279"], ["Greta Attard", "+35699049416"], ["Diane-Maria Borg", "+35679257390"]],
  [["Alannah Bonello", "+35699130938"], ["Nicholas Vella", "+35679558887"], ["Kimberly Micallef", "+35679992444"], ["Daniel Cassar", "+35699659195"], ["Rebekah Scerri", "+35679001398"]],
  [["Kimberley Hallett", "+35699034501"], ["Jessica Chetcuti Saydon", "+35679211470"], ["Sarah Scerri", "+35679806941"], ["Jacob Micallef Tanti", "+35699839464"], ["Gilbert Tanti", "+35677638172"]],
];

// Fixed anchor for the roster cycle math — never change this, or every
// already-posted request's stored day-offset will point at the wrong date.
const START = new Date(2026, 5, 22);
START.setHours(0, 0, 0, 0);

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

// The day pickers start today and run 4 calendar months ahead, expressed as
// offsets from START so they line up with the fixed cycle above.
const TODAY_OFFSET = Math.max(0, Math.round((TODAY - START) / (1000 * 60 * 60 * 24)));
const FOUR_MONTHS_FROM_TODAY = new Date(TODAY);
FOUR_MONTHS_FROM_TODAY.setMonth(FOUR_MONTHS_FROM_TODAY.getMonth() + 4);
const RANGE_DAYS = Math.round((FOUR_MONTHS_FROM_TODAY - TODAY) / (1000 * 60 * 60 * 24));
const GRADES = ["BST", "HST"];
const POST_CODES = ["A", "B", "C", "N"];

function offsetToDate(offset) {
  const d = new Date(START);
  d.setDate(d.getDate() + offset);
  return d;
}

function dateStr(offset) {
  return offsetToDate(offset).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function isoDateForOffset(offset) {
  const d = offsetToDate(offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildStaff() {
  const staff = [];
  BST_TEAMS.forEach((members, teamIdx) => members.forEach(([name, phone]) => staff.push({ name, phone, grade: "BST", teamIdx })));
  HST_TEAMS.forEach((members, teamIdx) => members.forEach(([name, phone]) => staff.push({ name, phone, grade: "HST", teamIdx })));
  MANUAL_STAFF.forEach(({ name, phone, grade, weeklyPattern }) => staff.push({ name, phone, grade, manual: true, weeklyPattern }));
  return staff;
}

function weeklyPatternState(dayOffset) {
  const date = offsetToDate(dayOffset);
  const diffDays = Math.round((date - WEEKLY_PATTERN_ANCHOR) / (1000 * 60 * 60 * 24));
  const weekIdx = (((Math.floor(diffDays / 7)) % 6) + 6) % 6;
  const dayIdx = ((diffDays % 7) + 7) % 7; // 0 = Monday .. 6 = Sunday
  return WEEKLY_PATTERN[weekIdx][dayIdx] || "O";
}

function baseState(person, dayOffset) {
  if (person.weeklyPattern) {
    return weeklyPatternState(dayOffset);
  }
  if (person.manual) {
    const schedule = MANUAL_SCHEDULES[person.name] || {};
    return schedule[isoDateForOffset(dayOffset)] || "U";
  }
  const n = CYCLE.length;
  // Verified against the real roster (Trainee Mega Sheet): each team's
  // offset advances the cycle forward, not backward.
  const idx = (((dayOffset + person.teamIdx) % n) + n) % n;
  const code = CYCLE[idx];
  if (code === "B" && person.grade === "HST" && HST_B_TO_C_RESIDUE[person.name] !== undefined) {
    const residue = ((dayOffset % 12) + 12) % 12;
    if (residue === HST_B_TO_C_RESIDUE[person.name]) return "C";
  }
  return code;
}

function waLink(phone, text) {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function App() {
  // Sorted alphabetically for the dropdowns; each person still carries their
  // own teamIdx/grade, so this has no effect on shift-cycle calculations.
  const staff = useMemo(() => buildStaff().sort((a, b) => a.name.localeCompare(b.name)), []);

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
  const [coverDay, setCoverDay] = useState(TODAY_OFFSET + 2);
  const [extraForm, setExtraForm] = useState({ grade: "BST", day: TODAY_OFFSET + 2, code: "N" });
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
    const existing = stateOf(name, req.day);
    if (WORKING.has(existing)) {
      // Only exception: already having a Night shift doesn't block taking a
      // C-type shift the same day (and vice versa) — they don't overlap.
      const nightAndC =
        (NIGHT_CODES.has(existing) && C_START_CODES.has(req.code)) ||
        (C_START_CODES.has(existing) && NIGHT_CODES.has(req.code));
      if (!nightAndC) return false;
    }
    // No one should go straight from a Night shift into a shift starting at
    // 08:00 the next day (C/C2/C3) — zero rest in between.
    if (C_START_CODES.has(req.code) && stateOf(name, req.day - 1) === "N") return false;
    return true;
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
              {Array.from({ length: RANGE_DAYS }).map((_, i) => {
                const d = TODAY_OFFSET + i;
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
              {Array.from({ length: RANGE_DAYS }).map((_, i) => { const d = TODAY_OFFSET + i; return <option key={d} value={d}>{dateStr(d)}</option>; })}
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

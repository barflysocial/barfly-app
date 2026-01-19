/**
 * Barfly Match Relay — Alias Authority
 * - Assigns UNIQUE aliases per {roomId, session, eventType}
 * - Pools: 10,000 Dating + 10,000 Networking (generated from 100x100 word grids)
 * - Sends submit_ack directly to the submitting guest with {id, alias}
 * - Forwards enhanced submit_payload (with id + alias) to hosts
 */

const http = require("http");
const WebSocket = require("ws");

/* -----------------------------
   Config
------------------------------ */
const PORT = process.env.PORT || 10000;

/* -----------------------------
   Utilities
------------------------------ */
function now() { return Date.now(); }

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function hash32(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function xorshift32(seed) {
  let x = seed >>> 0;
  return function rand() {
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17) >>> 0;
    x ^= (x << 5) >>> 0;
    return (x >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, seedStr) {
  const rand = xorshift32(hash32(seedStr));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeEventType(t) {
  const s = String(t || "").toLowerCase();
  if (s.includes("network")) return "networking";
  if (s.includes("dating")) return "dating";
  return "";
}

function send(ws, obj) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  } catch {}
}

function broadcast(set, obj) {
  for (const ws of set) send(ws, obj);
}

/* -----------------------------
   10,000 Alias Pools (100 x 100)
   - Dating: love/dating themed
   - Networking: professional themed
------------------------------ */

// 100 dating adjectives
const DATING_ADJ = [
  "Adoring","Affectionate","Alluring","Amorous","Angel","Ardent","Blissful","Bold","Bright","Captivating",
  "Charming","Cheeky","Cherished","Cozy","Crushworthy","Cupid","Dazzling","Darling","Dear","Dreamy",
  "Electric","Enchanted","Endearing","Enticing","Eternal","Flirty","Fond","Fox","Giddy","Golden",
  "Heartfelt","Honey","Hot","Huggable","InSync","Irresistible","Joyful","Kissable","Lively","Lovely",
  "Loyal","Magnetic","Moonlit","Nifty","Openhearted","Passionate","Playful","Precious","Pure","Radiant",
  "Romantic","Rosy","Smitten","Snuggly","Sparkling","Spicy","Starry","Steady","Sugar","Sweet",
  "Tender","True","Unforgettable","Velvet","Warm","Wholesome","Witty","Wonder","Yearning","Zesty",
  "Blushing","Butterfly","Candlelit","Caring","Chivalrous","Cuddly","Devoted","Fated","Gentle","Glowing",
  "Handsome","Lovestruck","Mellow","Muse","New","Petal","Poetic","Rendezvous","Serene","Stolen",
  "Sunlit","Thrilling","Timeless","Twinkling","Valentine","Vivid","Wildhearted","Winsome","Swoon","Beloved"
];

// 100 dating nouns
const DATING_NOUN = [
  "Arrow","Aura","Bliss","Bouquet","Butterfly","Candle","Charm","Chemistry","Cherub","Crush",
  "Cupid","Daisy","Date","Desire","Dream","Embrace","EverAfter","Flame","Flower","Fortune",
  "Garden","Glimmer","Heart","Heartbeat","Honeybee","Hug","Jewel","Kiss","Lantern","Love",
  "Lullaby","Magic","Melody","Moon","Muse","Necklace","Night","Note","Ocean","Orbit",
  "Promise","Pulse","Rainbow","Rendezvous","Ring","Rose","Serenade","Shimmer","Smile","Spark",
  "Starlight","Story","Swoon","Sweetheart","Symphony","Tender","Thread","Touch","Treasure","Truth",
  "Valentine","Vibe","Whisper","Wink","Wonder","Boulevard","Coffee","Conversation","Dance","Destiny",
  "Dimpler","Firework","FirstDate","Glow","Harmony","HighFive","InsideJoke","Laugh","Memory","Moment",
  "Moonbeam","MuseNote","Outing","Picnic","Playlist","Poem","Postcard","Reel","Snap","Sunset",
  "Text","Toast","Together","Vow","Warmth","Weekend","Wine","Wish","Handhold","Soulmate"
];

// 100 networking adjectives
const NET_ADJ = [
  "Agile","Analytical","Apex","Astute","Bold","Branded","Builder","Calibrated","Capable","Clever",
  "ClientReady","Collaborative","Connected","Creative","Credible","Crisp","DataDriven","Decisive","Dedicated","Diligent",
  "Direct","Driven","Dynamic","Efficient","Elevated","Empowered","Engineered","Evolving","Expert","Focused",
  "Forward","FutureReady","Global","GoalOriented","Grounded","Growth","Hardworking","HighImpact","Honed","Insightful",
  "Innovative","Integrated","Intentional","Keen","Leader","Lean","LevelUp","Mentor","Modern","Motivated",
  "Networked","NextGen","Operational","Optimized","Organized","Outcome","Partner","Performance","Pioneering","Polished",
  "Practical","Precision","Prepared","Proactive","Productive","Professional","Progressive","Project","Quality","Reliable",
  "Resilient","Resourceful","Results","Savvy","Scalable","Sharp","Skilled","Solution","Strategic","Streamlined",
  "Structured","Synergy","Systems","Tactical","Talent","Team","Technical","Timely","Trusted","Vision",
  "Visionary","Workflow","Value","Accurate","Catalyst","Consultative","Executive","Founder","Managerial","Principal",
  "Pipeline","Platform","Revenue","Operations","Market","InvestorReady","Hiring","Coaching","BuilderMindset","Opportunity"
];

// 100 networking nouns
const NET_NOUN = [
  "Advisor","Analyst","Architect","Associate","Builder","Catalyst","CFO","Channel","Coach","Collaborator",
  "Connector","Consultant","Creator","DecisionMaker","Designer","Director","Engineer","Entrepreneur","Executive","Founder",
  "Growth","Guide","HiringLead","Innovator","Investor","Leader","Liaison","Manager","Mentor","Operator",
  "Owner","Partner","Planner","Producer","Product","Program","ProjectLead","Prospect","Recruiter","Researcher",
  "Sales","Scout","Specialist","Strategist","Talent","TeamLead","Technologist","Thinker","Trailblazer","Visionary",
  "Client","Customer","Pipeline","Network","Opportunity","Workshop","Pitch","Panel","Meetup","Summit",
  "Roadmap","Launch","Sprint","Brief","Stack","Studio","Agency","Firm","Venture","Fund",
  "Deal","Contract","Partnership","Referral","Collab","Build","Hire","Role","Seat","Desk",
  "StudioLead","Ops","PM","CTO","COO","CEO","Board","Angel","Vendor","Supplier",
  "Account","Portfolio","CaseStudy","Benchmark","Insight","Report","Demo","Prototype","Blueprint","Framework"
];

function buildPool10000(adjs, nouns, joiner = "") {
  // 100 x 100 = 10,000
  const out = [];
  for (let i = 0; i < adjs.length; i++) {
    for (let j = 0; j < nouns.length; j++) {
      out.push(`${adjs[i]}${joiner}${nouns[j]}`);
    }
  }
  return out;
}

/* -----------------------------
   Session State
------------------------------ */
const rooms = new Map();
/**
 * rooms: Map<roomId, {
 *   sessions: Map<sessionId, {
 *     clients: Set<ws>,
 *     hosts: Set<ws>,
 *     tvs: Set<ws>,
 *     peopleById: Map<personId, { id, alias, eventType, createdAt }>,
 *     alias: {
 *       dating: { queue: string[], used: Set<string>, seed: string },
 *       networking: { queue: string[], used: Set<string>, seed: string }
 *     }
 *   }>
 * }>
 */

function getSession(roomId, sessionId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { sessions: new Map() });
  const r = rooms.get(roomId);
  if (!r.sessions.has(sessionId)) {
    r.sessions.set(sessionId, {
      clients: new Set(),
      hosts: new Set(),
      tvs: new Set(),
      peopleById: new Map(),
      alias: {
        dating: null,
        networking: null
      }
    });
  }
  return r.sessions.get(sessionId);
}

function ensureAliasAllocator(sess, roomId, sessionId, eventType) {
  if (eventType !== "dating" && eventType !== "networking") return;

  if (sess.alias[eventType]) return;

  const seed = `alias_${roomId}__${sessionId}__${eventType}`;
  const basePool =
    eventType === "dating"
      ? buildPool10000(DATING_ADJ, DATING_NOUN, "")
      : buildPool10000(NET_ADJ, NET_NOUN, "");

  shuffleInPlace(basePool, seed);

  sess.alias[eventType] = {
    seed,
    queue: basePool,
    used: new Set()
  };
}

function allocateAlias(sess, roomId, sessionId, eventType) {
  const t = normalizeEventType(eventType);
  if (t !== "dating" && t !== "networking") return "Guest";

  ensureAliasAllocator(sess, roomId, sessionId, t);
  const alloc = sess.alias[t];

  // Find next unused
  while (alloc.queue.length) {
    const a = alloc.queue.shift();
    if (!alloc.used.has(a)) {
      alloc.used.add(a);
      return a;
    }
  }

  // Exhausted (shouldn’t happen unless >10k people). Fallback:
  let i = alloc.used.size + 1;
  while (alloc.used.has(`${t === "dating" ? "Love" : "Pro"}${i}`)) i++;
  const fallback = `${t === "dating" ? "Love" : "Pro"}${i}`;
  alloc.used.add(fallback);
  return fallback;
}

/* -----------------------------
   Server + WS
------------------------------ */
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Barfly relay up\n");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws._meta = {
    role: "",
    roomId: "",
    session: "",
    clientNonce: ""
  };

  ws.on("message", (data) => {
    const msg = safeJsonParse(String(data));
    if (!msg || typeof msg !== "object") return;

    const type = msg.type;

    // Normalize identifiers
    const roomId = String(msg.roomId || msg.room || msg.barId || "").trim();
    const sessionId = String(msg.session || "").trim();
    const role = String(msg.role || msg._role || "").trim().toLowerCase();

    // JOIN
    if (type === "join") {
      if (!roomId || !sessionId) {
        send(ws, { type: "error", message: "Missing roomId/session" });
        return;
      }

      ws._meta.role = role || "guest";
      ws._meta.roomId = roomId;
      ws._meta.session = sessionId;
      ws._meta.clientNonce = String(msg.clientNonce || msg.voterNonce || "").trim();

      const sess = getSession(roomId, sessionId);

      // register
      if (ws._meta.role === "host") sess.hosts.add(ws);
      else if (ws._meta.role === "tv") sess.tvs.add(ws);
      else sess.clients.add(ws);

      send(ws, { type: "joined", roomId, session: sessionId, role: ws._meta.role });
      return;
    }

    // No routing without join meta
    const m = ws._meta;
    const rId = roomId || m.roomId;
    const sId = sessionId || m.session;
    if (!rId || !sId) return;

    const sess = getSession(rId, sId);

    // CONFIG request: forward to hosts
    if (type === "request_config") {
      broadcast(sess.hosts, msg);
      return;
    }

    // CONFIG broadcast: host -> everyone
    if (type === "config" || type === "event_config") {
      broadcast(sess.clients, msg);
      broadcast(sess.tvs, msg);
      broadcast(sess.hosts, msg); // keep hosts in sync too
      return;
    }

    // SUBMIT PAYLOAD (guest -> relay assigns alias, forwards to hosts)
    if (type === "submit_payload") {
      const payload = msg.payload || {};
      const eventType = normalizeEventType(payload.eventType || msg.eventType || payload.type);

      const clientNonce = String(payload.clientNonce || msg.clientNonce || m.clientNonce || "").trim();
      const personId = String(payload.id || payload.personId || clientNonce || "").trim();

      if (!personId) {
        send(ws, { type: "submit_ack", ok: false, reason: "Missing clientNonce/personId" });
        return;
      }

      // If already exists, keep same alias
      let person = sess.peopleById.get(personId);
      if (!person) {
        const alias = allocateAlias(sess, rId, sId, eventType);
        person = { id: personId, alias, eventType, createdAt: now() };
        sess.peopleById.set(personId, person);
      }

      // Ack the submitter immediately (authoritative alias)
      send(ws, {
        type: "submit_ack",
        ok: true,
        id: person.id,
        alias: person.alias,
        eventType: person.eventType || eventType,
        clientNonce
      });

      // Forward to hosts with enhanced payload
      const enhanced = {
        ...payload,
        id: person.id,
        personId: person.id,
        alias: person.alias,
        eventType: person.eventType || eventType
      };

      broadcast(sess.hosts, { type: "submit_payload", payload: enhanced });

      // Optional: tell TVs a person joined (they still need roster from host to show scores)
      broadcast(sess.tvs, { type: "person_joined", person: { id: person.id, alias: person.alias, eventType: enhanced.eventType } });

      return;
    }

    // VOTE (guest -> hosts)
    if (type === "vote") {
      broadcast(sess.hosts, msg);
      return;
    }

    // REQUEST ROSTER (guest/tv -> hosts)
    if (type === "request_roster") {
      broadcast(sess.hosts, msg);
      return;
    }

    // ROSTER SYNC (host -> everyone)
    if (type === "roster_sync" || type === "people_sync") {
      broadcast(sess.clients, msg);
      broadcast(sess.tvs, msg);
      return;
    }

    // CONTACT SAVE / RELEASE (guest <-> hosts)
    if (type === "contact_save") {
      broadcast(sess.hosts, msg);
      return;
    }
    if (type === "contact_saved_ack" || type === "contact_release") {
      broadcast(sess.clients, msg);
      return;
    }

    // Default: forward unknown host messages to guests + tvs if needed
    if (m.role === "host") {
      broadcast(sess.clients, msg);
      broadcast(sess.tvs, msg);
    }
  });

  ws.on("close", () => {
    const m = ws._meta || {};
    if (!m.roomId || !m.session) return;
    const sess = getSession(m.roomId, m.session);
    sess.clients.delete(ws);
    sess.hosts.delete(ws);
    sess.tvs.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log("Relay listening on", PORT);
});


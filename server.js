"use strict";
/**
 * Torneo LLAVES — backend (API + sync en vivo).
 *
 * - API REST + SSE. NO sirve frontend (el front es repo aparte).
 * - Guarda UN estado compartido (torneo activo) en Postgres si hay
 *   DATABASE_URL; si no, en memoria (local).
 * - Admin (cabecera x-admin-key === ADMIN_KEY) escribe; el resto solo lee.
 * - Cambios se empujan a todos los clientes vía SSE (/api/events).
 *
 * Env vars:
 *   ADMIN_KEY        clave para editar (obligatoria; elígela tú).
 *   DATABASE_URL     conexión Postgres (Railway la inyecta al añadir el plugin).
 *   ALLOWED_ORIGIN   origen del front para CORS (ej: https://tu-front.up.railway.app).
 *                    Acepta varios separados por coma. "*" = cualquiera.
 *   PORT             puerto (Railway lo inyecta).
 */

const express = require("express");

const app = express();
app.use(express.json({ limit: "4mb" }));

const ADMIN_KEY = process.env.ADMIN_KEY || "cambia-esta-clave";
const PORT = process.env.PORT || 3000;
const USE_PG = !!process.env.DATABASE_URL;
const ORIGINS = (process.env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim());

/* ---------- CORS ---------- */
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (ORIGINS.includes("*")) res.set("Access-Control-Allow-Origin", "*");
  else if (origin && ORIGINS.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------- storage ---------- */
let mem = null;
let pool = null;

if (USE_PG) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

async function initDb() {
  if (!USE_PG) return;
  await pool.query(
    "CREATE TABLE IF NOT EXISTS app_state (id int PRIMARY KEY, data jsonb, updated_at timestamptz DEFAULT now())"
  );
}

async function getState() {
  if (!USE_PG) return mem;
  const r = await pool.query("SELECT data FROM app_state WHERE id = 1");
  return r.rows[0] ? r.rows[0].data : null;
}

async function setState(data) {
  if (!USE_PG) { mem = data; return; }
  await pool.query(
    "INSERT INTO app_state (id, data, updated_at) VALUES (1, $1, now()) " +
    "ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()",
    [data]
  );
}

/* ---------- SSE ---------- */
const clients = new Set();
function broadcast(state) {
  const payload = "data: " + JSON.stringify({ state }) + "\n\n";
  for (const res of clients) {
    try { res.write(payload); } catch (_) { /* ignore */ }
  }
}

/* ---------- API ---------- */
function isAdmin(req) { return req.get("x-admin-key") === ADMIN_KEY; }

app.get("/", (req, res) => res.json({ ok: true, service: "llaves-torneo-back" }));

app.get("/api/state", async (req, res) => {
  try { res.json({ state: await getState() }); }
  catch (e) { console.error(e); res.status(500).json({ error: "db" }); }
});

app.get("/api/admin/verify", (req, res) => res.json({ ok: isAdmin(req) }));

app.post("/api/state", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "forbidden" });
  const state = req.body ? req.body.state : null;
  try { await setState(state); broadcast(state); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "db" }); }
});

app.get("/api/events", async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write("retry: 3000\n\n");
  try { res.write("data: " + JSON.stringify({ state: await getState() }) + "\n\n"); }
  catch (_) { /* ignore */ }
  clients.add(res);
  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (_) {} }, 25000);
  req.on("close", () => { clearInterval(ping); clients.delete(res); });
});

/* ---------- boot ---------- */
initDb()
  .then(() => app.listen(PORT, () => console.log("Back en puerto " + PORT + (USE_PG ? " (Postgres)" : " (memoria)"))))
  .catch((e) => {
    console.error("DB init falló:", e.message);
    app.listen(PORT, () => console.log("Back en puerto " + PORT + " (memoria, DB falló)"));
  });

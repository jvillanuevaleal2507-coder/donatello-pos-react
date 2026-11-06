import test from "node:test";
import assert from "node:assert/strict";
import { requirePosUser } from "../api/atlas/_auth.js";

process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "public-test-key";

async function checkAccess(membership, requestToken = "valid-token") {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "member-123" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/rest/v1/pos_authorized_users?")) {
      return new Response(JSON.stringify(membership ? [membership] : []), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error("Unexpected Supabase request");
  };
  const result = { statusCode: null, body: null };
  const res = {
    status(statusCode) { result.statusCode = statusCode; return this; },
    json(body) { result.body = body; return this; },
  };
  try {
    const user = await requirePosUser(
      { headers: { authorization: "Bearer " + requestToken } }, res,
    );
    return { user, result, calls };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("administrador activo conserva acceso Atlas", async () => {
  const { user, result, calls } = await checkAccess({
    user_id: "member-123", role: "admin", active: true,
  });
  assert.equal(user?.user?.id, "member-123");
  assert.equal(result.statusCode, null);
  assert.equal(calls.length, 2);
});

test("operador activo no puede usar endpoints de Atlas", async () => {
  const { user, result } = await checkAccess({
    user_id: "member-123", role: "operador", active: true,
  });
  assert.equal(user, null);
  assert.equal(result.statusCode, 403);
});

test("administrador suspendido no puede usar Atlas", async () => {
  const { user, result } = await checkAccess({
    user_id: "member-123", role: "admin", active: false,
  });
  assert.equal(user, null);
  assert.equal(result.statusCode, 403);
});

test("membresía de otro usuario no autoriza la sesión", async () => {
  const { user, result } = await checkAccess({
    user_id: "other-user", role: "admin", active: true,
  });
  assert.equal(user, null);
  assert.equal(result.statusCode, 403);
});

test("usuario sin membresía queda bloqueado", async () => {
  const { user, result } = await checkAccess(null);
  assert.equal(user, null);
  assert.equal(result.statusCode, 403);
});

test("sin sesión no se llama Supabase", async () => {
  let code = null;
  const user = await requirePosUser({ headers: {} }, {
    status(status) { code = status; return this; },
    json() { return this; },
  });
  assert.equal(user, null);
  assert.equal(code, 401);
});

async function supabaseRequest(path, accessToken) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase server auth is not configured.");
  }

  return fetch(`${supabaseUrl}${path}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

export async function requirePosUser(req, res) {
  const authorization = String(req.headers?.authorization || "");
  if (!authorization.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado." });
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "No autenticado." });
    return null;
  }

  try {
    const userResponse = await supabaseRequest("/auth/v1/user", token);
    if (!userResponse.ok) {
      res.status(401).json({ error: "Sesión inválida o vencida." });
      return null;
    }

    const user = await userResponse.json();
    if (!user?.id) {
      res.status(401).json({ error: "Sesión inválida." });
      return null;
    }

    const params = new URLSearchParams({
      select: "user_id,role,active",
      user_id: `eq.${user.id}`,
      active: "eq.true",
      limit: "1",
    });

    const allowedResponse = await supabaseRequest(
      `/rest/v1/pos_authorized_users?${params.toString()}`,
      token
    );

    const allowed = allowedResponse.ok ? await allowedResponse.json() : [];
    if (!Array.isArray(allowed) || allowed.length === 0) {
      res.status(403).json({ error: "Usuario no autorizado para Atlas." });
      return null;
    }

    return { user, authorization };
  } catch (error) {
    console.error("Atlas auth error", error);
    res.status(500).json({ error: "No se pudo validar la sesión." });
    return null;
  }
}

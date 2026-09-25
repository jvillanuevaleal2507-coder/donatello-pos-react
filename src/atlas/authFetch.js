import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function authorizedAtlasFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  if (!accessToken) {
    throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  }

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

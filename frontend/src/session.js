export const SESSION_KEY = "reconnect_session";

export function readSession(storage, token) {
  try {
    const cached = JSON.parse(storage.get(SESSION_KEY));
    return token && cached?.token === token && cached.user?.id ? cached : null;
  } catch { return null; }
}

export async function validateSession(api, isCurrent, clear, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await api("/auth/me"); }
    catch (error) {
      if (!isCurrent()) return null;
      if ([401, 403].includes(error.status)) { clear(); throw error; }
      if (attempt || (error.status && error.status < 500)) throw error;
      await wait(1500);
      if (!isCurrent()) return null;
    }
  }
}

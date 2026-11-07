import { installReadiness, teamControls } from "./readiness.js";
import { installSocialUI } from "./social.js";
import { SESSION_KEY, readSession, validateSession } from "./session.js";
import { shareTools, inviteUrl } from "./communities.js";
import { compressPhoto } from "./photo.js";
import { contentPage } from "./content.js";
import "./style.css";
import { initDotMatrixCanvas } from "./canvas.js";
import {
  $,
  escape,
  avatar,
  tags,
  link,
  profileCard,
  publicProfile,
  skillRow,
  projectRow,
  inviteButton,
} from "./ui.js";
const TOKEN_KEY = "reconnect_token";
const storage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      value === null
        ? localStorage.removeItem(key)
        : localStorage.setItem(key, value);
    } catch {}
  },
};
const initialToken = storage.get(TOKEN_KEY);
const cachedSession = readSession(storage, initialToken);
const state = {
  token: initialToken,
  user: cachedSession?.user || null,
  profile: cachedSession?.profile || null,
  profiles: [],
  invitations: [],
  notifications: [],
  matches: false,
  directoryLoaded: false,
  viewProfile: null,
  teams: [],
  teamRequests: [],
  savedTeams: [],
  links: {},
};
let communitySuggestionsPending = false;
let requestVersion = 0,
  routeVersion = 0,
  teamVersion = 0,
  polling = false,
  toastTimer,
  searchTimer,
  authMode = "login",
  afterAuth = null,
  editingTeam = null,
  deleteAction = null,
  editorOwner = null;
const csv = (value) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const pendingReads = new Map();
function api(path, options = {}) {
  if ((options.method || "GET").toUpperCase() !== "GET") {
    // A subsequent read must see the mutation rather than reuse an older request.
    pendingReads.clear();
    return requestApi(path, options);
  }
  const key = JSON.stringify([state.token, path]);
  if (!pendingReads.has(key)) {
    const request = requestApi(path, options).finally(() => {
      if (pendingReads.get(key) === request) pendingReads.delete(key);
    });
    pendingReads.set(key, request);
  }
  return pendingReads.get(key);
}
async function requestApi(path, options = {}) {
  const token = state.token;
  const response = await fetch(`/api${path}`, {
    signal: AbortSignal.timeout(path === "/match" || path === "/communities/suggestions" ? 55000 : 30000),
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await response.json().catch(() => ({
    message: "The service is unavailable. Please try again.",
  }));
  if (token && token !== state.token)
    throw new Error("Your session changed. Please try again.");
  if (!response.ok) {
    if (
      response.status === 401 &&
      token === state.token &&
      !path.startsWith("/auth/")
    )
      clearSession();
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
const send = (path, body = {}, method = "POST") =>
  api(path, { method, body: JSON.stringify(body) });
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function renderAccount() {
  if (state.token && state.user)
    storage.set(SESSION_KEY, JSON.stringify({ token: state.token, user: state.user, profile: state.profile }));
  const quickProfile = document.querySelector('[data-mobile-action="profile"]');
  if (quickProfile) quickProfile.textContent = state.user ? "My Profile" : "Sign In / Sign Up";
  $("account").hidden = !state.user;
  $("open-auth").hidden = !!state.user;


  $("create-profile").hidden = !state.user;
  $("connections-section").hidden = !state.user;
  $("my-teams-label").hidden = !state.user;
  $("account-name").textContent = state.user?.name?.split(" ")[0] || "Account";
  const image = state.profile?.avatar || state.user?.avatar;
  $("avatar").hidden = !image;
  $("account-initial").hidden = !!image;
  $("account-initial").textContent = (state.user?.name || "R")
    .charAt(0)
    .toUpperCase();
  if (image) $("avatar").src = image;
  $("create-profile").textContent = state.profile
    ? "Edit Profile"
    : "Create Profile";
}
function clearSession(persist = true) {
  social.reset();
  readiness.reset();
  state.teamRequests = [];
  state.token = null;
  state.user = null;
  state.profile = null;
  state.invitations = [];
  state.notifications = [];
  state.savedTeams = [];
  state.teams = [];
  $("account-menu").open = false;
  if (persist) {
    storage.set(TOKEN_KEY, null);
    storage.set(SESSION_KEY, null);
  }
  editorOwner = null;
  for (const id of [
    "notifications",
    "profile-dialog",
    "team-dialog",
    "delete-dialog",
    "community-dialog",
    "community-created",
  ])
    $(id).close();
  $("profile-form").reset();
  $("skill-rows").replaceChildren();
  $("project-rows").replaceChildren();
  $("notification-list").replaceChildren();
  $("connections").replaceChildren();
  $("unread").textContent = "0";
  window.google?.accounts?.id.disableAutoSelect();
  renderAccount();
  renderProfiles();
  renderViewedProfile();
  renderTeams();
  if (location.pathname === "/projects") void loadContent();
  if (["/teams", "/saved-teams", "/my-teams"].includes(location.pathname)) void loadTeams();
}
async function hydrate() {
  const token = state.token;
  const user = await validateSession(api, () => token === state.token, clearSession);
  if (!user || token !== state.token) return;
  state.user = user;
  renderAccount();
  void social.restore();
  const profile = await api("/profiles/me");
  if (token !== state.token) return;
  state.profile = profile;
  renderAccount();
  renderProfiles();
  renderViewedProfile();
  const savedTeams = await api("/teams/saved");
  if (token !== state.token) return;
  state.savedTeams = savedTeams;
  if (location.pathname === "/projects") void loadContent();
  if (["/teams", "/saved-teams", "/my-teams"].includes(location.pathname)) await loadTeams();
  await refreshNotifications();
}
async function signedIn(result) {
  state.token = result.token;
  state.user = result.user;
  state.profile = null;
  renderAccount();
  storage.set(TOKEN_KEY, result.token);
  $("auth-dialog").close();
  $("auth-form").elements.password.value = "";
  toast("Signed in successfully.");
  await hydrate().catch(error => toast(error.message));
  const action = afterAuth;
  afterAuth = null;
  if (action) action();
}
function setAuthMode(mode) {
  authMode = mode;
  const form = $("auth-form"),
    registration = mode === "register",
    reset = mode === "reset",
    forgot = mode === "forgot";
  $("auth-title").textContent = {
    login: "Welcome back",
    register: "Join the builders",
    forgot: "Reset your password",
    reset: "Check your inbox",
  }[mode];
  $("auth-methods").hidden = forgot || reset;
  $("auth-name-label").hidden = !registration;
  form.elements.fullName.disabled = !registration;
  form.elements.fullName.required = registration;
  $("auth-otp-label").hidden = !reset;
  form.elements.otp.disabled = !reset;
  form.elements.otp.required = reset;
  $("auth-password-label").hidden = forgot;
  form.elements.password.disabled = forgot;
  form.elements.password.required = !forgot;
  form.elements.password.autocomplete =
    mode === "login" ? "current-password" : "new-password";
  form.elements.password.value = "";
  $("auth-submit").textContent = {
    login: "Sign In",
    register: "Create account",
    forgot: "Send reset code",
    reset: "Update password",
  }[mode];
  $("forgot-password").hidden = forgot || reset;
  $("auth-back").hidden = !forgot && !reset;
  $("resend-code").hidden = !reset;
  $("auth-error").textContent = "";
  $("auth-message").textContent = "";
  document
    .querySelectorAll("[data-auth-mode]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.authMode === mode)),
    );
}
function openAuth(next) {
  afterAuth = next || null;
  setAuthMode("login");
  $("auth-dialog").showModal();
  void setupGoogle();
  $("auth-form").elements.email.focus();
}
$("open-auth").onclick = () => openAuth();
$("forgot-password").onclick = () => setAuthMode("forgot");
$("auth-back").onclick = () => setAuthMode("login");
$("resend-code").onclick = () => setAuthMode("forgot");
document
  .querySelectorAll("[data-auth-mode]")
  .forEach((b) => (b.onclick = () => setAuthMode(b.dataset.authMode)));
$("auth-form").onsubmit = async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  $("auth-submit").disabled = true;
  $("auth-error").textContent = "";
  try {
    const endpoint = {
      login: "login",
      register: "register",
      forgot: "forgot-password",
      reset: "reset-password",
    }[authMode];
    const result = await send(`/auth/${endpoint}`, values);
    if (authMode === "forgot") {
      setAuthMode("reset");
      $("auth-message").textContent = result.message;
      $("auth-form").elements.otp.focus();
    } else if (authMode === "reset") {
      setAuthMode("login");
      $("auth-message").textContent = result.message;
    } else await signedIn(result);
  } catch (error) {
    $("auth-error").textContent = error.message;
  } finally {
    $("auth-submit").disabled = false;
  }
};
let googleLoading = false;
let googleInitialized = false;
async function setupGoogle() {
  if (googleLoading) return;
  googleLoading = true;
  $("google-signin").textContent = "Loading Google sign-in…";
  try {
    const { googleClientId, links } = await api("/config");
    state.links = links || {};
    for (const anchor of document.querySelectorAll("[data-social]")) {
      const url = state.links[anchor.dataset.social];
      if (url) {
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.removeAttribute("data-route");
      }
    }
    if (location.pathname.startsWith("/resources/")) loadContent();
    if (!googleClientId)
      throw new Error("Google sign-in is unavailable. Use email below.");
    await new Promise((resolve, reject) => {
      let n = 0;
      const timer = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(timer);
          resolve();
        } else if (++n > 100) {
          clearInterval(timer);
          reject(
            new Error(
              "Google could not load. Email sign-in is available below.",
            ),
          );
        }
      }, 100);
    });
    if (!googleInitialized) {
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          try {
            await signedIn(await send("/auth/google", { credential }));
          } catch (error) {
            $("auth-error").textContent = error.message;
          }
        },
      });
      googleInitialized = true;
    }
    $("google-signin").replaceChildren();
    google.accounts.id.renderButton($("google-signin"), {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
    });
  } catch (error) {
    $("google-signin").textContent = error.message;
  } finally { googleLoading = false; }
}
$("signout").onclick = async () => {
  try {
    await send("/auth/logout");
    clearSession();
    toast("Signed out.");
  } catch (error) {
    clearSession();
    toast(
      "Signed out on this device. Server session revocation could not be confirmed.",
    );
  }
};
function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");

  $("theme-toggle").setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
  );
  $("theme-toggle").setAttribute("aria-pressed", String(theme === "dark"));
}
applyTheme(storage.get("reconnect_theme") || "light");
$("theme-toggle").onclick = async (event) => {
  const theme = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark";
  storage.set("reconnect_theme", theme);
  const button = $("theme-toggle");
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    applyTheme(theme);
    return;
  }
  const bounds = button.getBoundingClientRect();
  const x = event.detail ? event.clientX : bounds.left + bounds.width / 2;
  const y = event.detail ? event.clientY : bounds.top + bounds.height / 2;
  button.disabled = true;
  document.documentElement.classList.add("theme-wipe");
  try {
    const transition = document.startViewTransition(() => applyTheme(theme));
    await transition.ready;
    await document.documentElement.animate({
      clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${Math.hypot(innerWidth, innerHeight)}px at ${x}px ${y}px)`],
    }, { duration: 550, easing: "cubic-bezier(.2,.7,.2,1)", pseudoElement: "::view-transition-new(root)" }).finished;
    await transition.finished;
  } catch { applyTheme(theme); }
  finally {
    document.documentElement.classList.remove("theme-wipe");
    button.disabled = false;
  }
};
function navigate(url) {
  history.pushState({}, "", url);
  renderRoute();
}
function renderViewedProfile() {
  if (state.viewProfile && !$("public-view").hidden)
    $("public-view").innerHTML = publicProfile(state.viewProfile, state);
}
async function loadContent() {
  const version = routeVersion,
    path = (location.pathname.startsWith("/community/join/") || location.pathname === "/communities") ? "/projects" : location.pathname;
  $("content-view").innerHTML = '<p role="status">Loading…</p>';
  try {
    const html = await contentPage(path, { api, state, health: refreshHealth });
    if (version !== routeVersion) return;
    $("content-view").innerHTML = html;
    if (path === "/projects" && state.user && !communitySuggestionsPending) {
      communitySuggestionsPending = true;
      api("/communities/suggestions").then(matches => {
        if (version !== routeVersion || !state.user) return;
        for (const match of matches) {
          const button = document.querySelector(`[data-open-community="${CSS.escape(String(match.communityId))}"]`);
          if (button && !button.parentElement.querySelector(".recommended-label")) button.insertAdjacentHTML("afterend", '<p class="eyebrow recommended-label">Recommended for you</p>');
        }
      }).catch(() => {}).finally(() => { communitySuggestionsPending = false; });
    }
    const heading = $("content-view").querySelector("h1");
    if (heading) document.title = heading.textContent + " — Reconnect";
  } catch (error) {
    if (version === routeVersion)
      $("content-view").innerHTML =
        '<div class="empty"><h1>Could not load this page</h1><p>' +
        escape(error.message) +
        "</p><button data-refresh-content>Try again</button></div>";
  }
}
async function refreshHealth() {
  let health;
  try {
    const response = await fetch("/api/health", {
      signal: AbortSignal.timeout(5000),
    });
    health = await response.json();
    if (!health.status) throw Error("Unsupported health response");
  } catch {
    health = {
      status: "unavailable",
      services: { api: "unavailable" },
      checkedAt: new Date().toISOString(),
    };
  }
  $("system-status").dataset.status = health.status === "unavailable" ? "unavailable" : "operational";
  $("system-status-label").textContent =
    health.status !== "unavailable" ? "All Systems Operational" : "Temporarily unavailable";
  return health;
}
async function renderRoute() {
  const version = ++routeVersion,
    path = (location.pathname.startsWith("/community/join/") || location.pathname === "/communities") ? "/projects" : location.pathname;
  const profileId = path.match(/^\/profile\/([^/]+)$/)?.[1];
  const teams = ["/teams", "/saved-teams", "/my-teams"].includes(path),
    home = ["/", "/match"].includes(path),
    content = !home && !teams && !profileId;
  $("home-view").hidden = !home;
  $("public-view").hidden = !profileId;
  $("teams-view").hidden = !teams;
  $("content-view").hidden = !content;
  document.body.classList.toggle("match-view", path === "/match");
  $("primary-links").classList.remove("mobile-open");
  $("mobile-menu-toggle").setAttribute("aria-expanded", "false");
  $("account-menu").open = false;
  const active =
    path === "/match"
      ? "match"
      : teams
        ? "teams"
        : path === "/projects"
          ? "projects"
          : home || profileId
            ? "explore"
            : "";
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  state.viewProfile = null;
  if (profileId) {
    $("public-view").innerHTML =
      '<p role="status">Loading builder profile…</p>';
    try {
      const profile = await api("/profiles/" + encodeURIComponent(profileId));
      if (version !== routeVersion) return;
      state.viewProfile = profile;
      renderViewedProfile();
      document.title = profile.fullName + " — Reconnect";
    } catch (error) {
      if (version === routeVersion)
        $("public-view").innerHTML =
          '<div class="empty"><h1>Profile unavailable</h1><p>' +
          escape(error.message) +
          '</p><a href="/" data-route>Explore builders</a></div>';
    }
  } else if (content) await loadContent();
  else {
    document.title = teams
      ? "Teams & Hackathons — Reconnect"
      : "Reconnect — Find Builders & Hackathon Partners";
    if (teams) {
      $("teams-view").querySelector("h1").textContent =
        path === "/my-teams" ? "My Teams" : path === "/saved-teams" ? "Saved Teams" : "Teams & Hackathons";
      $("team-view-filter").closest("label").hidden =
        ["/my-teams", "/saved-teams"].includes(path) || !state.user;
      await loadTeams();
    } else if (location.hash === "#discovery") $("discovery").scrollIntoView();
  }
  if (!location.hash) window.scrollTo(0, 0);
}
window.addEventListener("popstate", renderRoute);
document.addEventListener("click", (event) => {
  const a = event.target.closest("a[data-route]");
  if (
    !a ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
    return;
  event.preventDefault();
  navigate(a.getAttribute("href"));
});
function renderProfiles() {
  if (!state.directoryLoaded) return;
  if (state.profiles.length) {
    $("profiles").innerHTML = state.profiles
      .map((p) => profileCard(p, state))
      .join("");
    return;
  }
  const filtered = [
    "search",
    "filter-skill",
    "filter-college",
    "filter-available",
  ].some((id) => $(id).value.trim());
  $("profiles").innerHTML =
    `<div class="empty"><h3>${state.matches ? "No complementary builders found yet." : filtered ? "No builders match these filters." : "No builders registered yet."}</h3><p>${state.matches ? "Check back as more builders join." : filtered ? "Try broader filters or explore all builders." : "Be the first to publish a profile and let your work speak."}</p><button data-edit-profile>Create Profile ↗</button></div>`;
}
async function loadProfiles() {
  const version = ++requestVersion;
  state.matches = false;
  $("directory-status").textContent = "Loading builders…";
  const query = new URLSearchParams({
    search: $("search").value.trim(),
    skill: $("filter-skill").value.trim(),
    college: $("filter-college").value.trim(),
  });
  if ($("filter-available").value)
    query.set("available", $("filter-available").value);
  try {
    const profiles = await api(`/profiles?${query}`);
    if (version !== requestVersion) return;
    state.profiles = profiles;
    state.directoryLoaded = true;
    renderProfiles();
    $("directory-status").textContent =
      `${profiles.length} builder${profiles.length === 1 ? "" : "s"}`;
  } catch (error) {
    if (version !== requestVersion) return;
    state.directoryLoaded = false;
    $("directory-status").textContent = "Directory unavailable";
    $("profiles").innerHTML =
      `<div class="empty"><h3>We couldn’t load the directory.</h3><p>${escape(error.message)}</p><button id="retry">Try again</button></div>`;
    $("retry").onclick = loadProfiles;
  }
}
function queueSearch(source) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (location.pathname !== "/") navigate("/#discovery");
    loadProfiles();
  }, 300);
}
for (const id of ["search", "filter-skill", "filter-college"])
  $(id).oninput = () => queueSearch(id);
$("filter-available").onchange = () => loadProfiles();
$("search-form").onsubmit = (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  loadProfiles();
  $("discovery").scrollIntoView();
};
$("show-all").onclick = () => {
  for (const id of [
    "search",
    "filter-skill",
    "filter-college",
    "filter-available",
  ])
    $(id).value = "";
  loadProfiles();
};
async function match() {
  if (!state.user) return openAuth(match);
  if (!state.profile) {
    toast("Publish a profile so we can match your skills.");
    return openProfile();
  }
  navigate("/match");
  const version = ++requestVersion;
  $("match").disabled = true;
  $("nav-match").disabled = true;
  $("directory-status").textContent = "Finding complementary skills…";
  try {
    const matches = await send("/match");
    if (version !== requestVersion) return;
    state.matches = true;
    state.profiles = matches;
    state.directoryLoaded = true;
    renderProfiles();
    $("directory-status").textContent =
      `${matches.length} complementary matches`;
  } catch (error) {
    if (version === requestVersion)
      $("directory-status").textContent = error.message;
  } finally {
    $("match").disabled = false;
    $("nav-match").disabled = false;
  }
}
$("match").onclick = $("nav-match").onclick = match;
function awaitHeroSearch() {
  navigate("/#discovery");
  $("search").focus();
}
function openProfile() {
  if (!state.user) return openAuth(openProfile);
  const form = $("profile-form");
  if (editorOwner !== state.user.id) {
    form.reset();
    const p = state.profile || {
      fullName: state.user.name,
      avatar: state.user.avatar,
    };
    for (const key of [
      "fullName",
      "avatar",
      "headline",
      "about",
      "proofOfWork",
      "resumeUrl",
      "githubUrl",
      "portfolioUrl",
    ])
      form.elements[key].value = p[key] || "";
    for (const key of ["institution", "degree", "department", "batchYear"])
      form.elements[key].value = p.college?.[key] || "";
    form.elements.interests.value = p.interests?.join(", ") || "";
    form.elements.domains.value =
      p.hackathonAvailability?.domains?.join(", ") || "";
    form.elements.available.checked = !!p.hackathonAvailability?.available;
    form.elements.roles.value =
      p.hackathonAvailability?.roles?.join(", ") || "";
    form.elements.mentorshipAvailable.checked = !!p.mentorshipAvailable;
    $("skill-rows").innerHTML = (p.skills || []).map(skillRow).join("");
    $("project-rows").innerHTML = (p.projects || []).map(projectRow).join("");
    editorOwner = state.user.id;
  }
  $("profile-error").textContent = "";
  $("photo-preview").innerHTML = avatar({ avatar: form.elements.avatar.value, fullName: form.elements.fullName.value });
  $("profile-dialog").showModal();
  form.elements.fullName.focus();
}
$("create-profile").onclick = openProfile;
$("my-profile").onclick = () =>
  state.profile ? navigate(`/profile/${state.profile._id}`) : openProfile();
$("add-skill").onclick = () => {
  if ($("skill-rows").children.length >= 40)
    return toast("You can add up to 40 skills.");
  $("skill-rows").insertAdjacentHTML("beforeend", skillRow());
  $("skill-rows").lastElementChild.querySelector("input").focus();
};
$("add-project").onclick = () => {
  if ($("project-rows").children.length >= 20)
    return toast("You can add up to 20 projects.");
  $("project-rows").insertAdjacentHTML("beforeend", projectRow());
  $("project-rows").lastElementChild.querySelector("input").focus();
};
$("profile-dialog").addEventListener("click", (e) => {
  const button = e.target.closest("[data-remove-row]");
  if (button) button.closest(".repeater").remove();
});
$("profile-form").onsubmit = async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  values.college = {};
  for (const key of ["institution", "degree", "department", "batchYear"]) {
    values.college[key] = values[key];
    delete values[key];
  }
  values.skills = [...document.querySelectorAll(".skill-row")].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll("[data-field]")].map((el) => [
        el.dataset.field,
        el.value,
      ]),
    ),
  );
  values.projects = [...document.querySelectorAll(".project-row")].map(
    (row) => {
      const p = Object.fromEntries(
        [...row.querySelectorAll("[data-field]")].map((el) => [
          el.dataset.field,
          el.value,
        ]),
      );
      p.techStack = csv(p.techStack);
      return p;
    },
  );
  values.interests = csv(values.interests);
  values.hackathonAvailability = {
    available: event.target.elements.available.checked,
    domains: csv(values.domains),
    roles: csv(values.roles),
  };
  values.mentorshipAvailable =
    event.target.elements.mentorshipAvailable.checked;
  delete values.roles;
  delete values.available;
  delete values.domains;
  $("publish").disabled = true;
  $("profile-error").textContent = "";
  try {
    state.profile = await send("/profiles", values);
    editorOwner = null;
    state.user.avatar = state.profile.avatar;
    renderAccount();
    $("profile-dialog").close();
    toast("Profile published.");
    loadProfiles();
    navigate(`/profile/${state.profile._id}`);
  } catch (error) {
    $("profile-error").textContent = error.message;
  } finally {
    $("publish").disabled = false;
  }
};
function askDelete(title, description, action) {
  deleteAction = action;
  $("delete-title").textContent = title;
  $("delete-description").textContent = description;
  $("delete-error").textContent = "";
  $("delete-dialog").showModal();
}
$("confirm-delete").onclick = async () => {
  $("confirm-delete").disabled = true;
  try {
    await deleteAction();
    $("delete-dialog").close();
  } catch (error) {
    $("delete-error").textContent = error.message;
  } finally {
    $("confirm-delete").disabled = false;
  }
};
document.addEventListener("click", async (event) => {
  if (event.target.closest("[data-edit-profile]")) return openProfile();
  if (event.target.closest("[data-delete-profile]"))
    return askDelete(
      "Delete your public profile?",
      "This removes your published profile and closes your team listings. Your account and existing connections remain.",
      async () => {
        await api(`/profiles/${state.profile._id}`, { method: "DELETE" });
        state.profile = null;
        editorOwner = null;
        renderAccount();
        loadProfiles();
        navigate("/#discovery");
        toast("Profile deleted.");
      },
    );
  const button = event.target.closest("[data-invite]");
  if (!button) return;
  if (button.dataset.incoming) return openNotifications();
  if (!state.user) return openAuth();
  if (!state.profile) {
    toast("Publish your profile before connecting.");
    return openProfile();
  }
  const note = await social.requestNote();
  if (note === null) return;
  button.disabled = true;
  try {
    state.invitations.push(
      await send("/invitations", { receiverId: button.dataset.invite, note }),
    );
    renderProfiles();
    renderViewedProfile();
    renderTeams();
    void readiness.refreshProfile();
    toast("Invitation sent.");
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    if (error.status === 409) {
      await refreshNotifications();
      renderTeams();
    }
  }
});
function renderNotifications() {
  $("unread").textContent = state.notifications.filter((n) => !n.read).length;
  $("notifications-toggle").setAttribute(
    "aria-label",
    `Notifications: ${$("unread").textContent} unread`,
  );
  $("notification-list").innerHTML = state.notifications.length
    ? state.notifications
        .map(
          (n) => n.type === "team_join_request" ? `<article class="notification"><p>${escape(n.message)}</p>${n.status === "pending" ? `<button class="primary" data-response="accept" data-id="${n._id}">Accept</button><button data-response="decline" data-id="${n._id}">Decline</button>` : `<span class="muted">${escape(n.status)}</span>`}</article>` : n.type === "team_join_result" ? `<article class="notification"><p>${escape(n.message)}</p><a href="/my-teams" data-route>My Teams</a></article>` : n.type === "team_invite" ? `<article class="notification"><p>${escape(n.message)}</p>${n.status === "pending" ? `<button class="primary" data-team-response="accept" data-id="${n._id}">Join Team</button><button data-team-response="decline" data-id="${n._id}">Decline</button>` : `<span class="muted">${escape(n.status)}</span>`}</article>` : n.type === "community" ? `<article class="notification"><p>${escape(n.message)}</p><button class="primary" data-join-community="${escape(n.inviteCode)}">Join Community</button></article>` :
            `<article class="notification"><p><strong>${escape(n.senderId?.name || "A builder")}</strong> ${n.type === "invitation" ? "invited you to connect." : `${n.type === "accepted" ? "accepted" : "declined"} your invitation.`}</p>${n.note ? `<p class="preserve-lines">${escape(n.note)}</p>` : ""}<time>${escape(new Date(n.createdAt).toLocaleString())}</time>${n.type === "invitation" && n.invitationId?.status === "pending" ? `<button class="primary" data-response="accept" data-id="${n._id}">Accept</button><button data-response="decline" data-id="${n._id}">Decline</button>` : `<span class="muted">${escape(n.invitationId?.status || n.type)}</span>`}</article>`,
        )
        .join("")
    : '<p class="muted">No notifications yet. Invitations will appear here.</p>';
}
async function refreshNotifications() {
  if (!state.user || polling) return;
  polling = true;
  const token = state.token;
  try {
    const [notifications, invitations, connections] = await Promise.all([
      api("/notifications"),
      api("/invitations"),
      api("/connections"),
    ]);
    if (token !== state.token) return;
    state.notifications = notifications;
    state.invitations = invitations;
    renderNotifications();
    renderProfiles();
    renderViewedProfile();
    $("notification-status").textContent =
      "";
    $("connections").innerHTML = connections.length
      ? connections
          .map(
            (c) =>
              `<article class="card"><h3>${escape(c.name)}</h3><p>Invitation accepted. Plan your next build together.</p><a href="mailto:${escape(encodeURIComponent(c.email))}">${escape(c.email)}</a></article>`,
          )
          .join("")
      : '<p class="muted">Accepted connections will appear here.</p>';
  } catch (error) {
    $("notification-status").textContent =
      `Could not refresh: ${error.message}`;
  } finally {
    polling = false;
  }
}
async function openNotifications() {
  $("notifications").showModal();
  $("notifications-toggle").setAttribute("aria-expanded", "true");
  await refreshNotifications();
  const ids = state.notifications
    .filter((n) => !n.read)
    .map((n) => n._id)
    .slice(0, 200);
  if (ids.length)
    try {
      await send("/notifications/read", { ids });
      state.notifications.forEach((n) => {
        if (ids.includes(n._id)) n.read = true;
      });
      renderNotifications();
    } catch (error) {
      $("notification-status").textContent = error.message;
    }
}
$("notifications-toggle").onclick = openNotifications;
$("notifications").addEventListener("close", () =>
  $("notifications-toggle").setAttribute("aria-expanded", "false"),
);
$("notification-list").onclick = async (event) => {
  const button = event.target.closest("[data-response]");
  if (!button) return;
  const buttons = [...button.parentElement.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await send(`/notifications/${button.dataset.id}/respond`, {
      action: button.dataset.response,
    });
    await refreshNotifications();
    if (["/teams", "/my-teams"].includes(location.pathname)) await loadTeams();
    void readiness.refreshProfile();
    toast(
      button.dataset.response === "accept"
        ? "Invitation accepted."
        : "Invitation declined.",
    );
  } catch (error) {
    $("notification-status").textContent = error.message;
    buttons.forEach((b) => (b.disabled = false));
  }
};
function renderTeams() {
  if ($("teams-view").hidden) return;
  $("teams").innerHTML = state.teams.length
    ? state.teams
        .map((t) => {
          const saved = state.savedTeams.some((s) => s._id === t._id);
          return (
            '<article class="card"><p class="eyebrow">' +
            escape(t.event) +
            "</p><h3>" +
            escape(t.name) +
            "</h3>" + teamControls(t, state) + "<p>" +
            escape(t.description) +
            "</p>" +
            tags(t.domains || []) +
            (t.skillsNeeded.length
              ? "<p>Looking for</p>" + tags(t.skillsNeeded)
              : "") +
            "<p>" +
            t.openSlots +
            " open slots · " +
            escape(t.status) +
            "</p>" +
            (t.eventDate ? "<time>" + escape(t.eventDate) + "</time>" : "") +
            '<div class="card-links">' +
            (t.owner
              ? '<a href="/profile/' +
                t.owner.profileId +
                '" data-route>' +
                escape(t.owner.fullName) +
                " ↗</a>"
              : "") +
            link(t.eventUrl, "Event") +
            "</div>" +
            (t.ownerId === state.user?.id
              ? '<div class="toolbar"><button data-edit-team="' +
                t._id +
                '">Edit / Invite Connections</button><button class="danger" data-delete-team="' +
                t._id +
                '">Delete</button></div>'
              : t.status === "open"
                ? inviteButton(t.ownerId, state)
                : "<p>Recruitment closed</p>") +
            '<button class="save-team" data-save-team="' +
            t._id +
            '" aria-pressed="' +
            saved +
            '">' +
            (saved ? "Saved ✓" : "Save team") +
            "</button></article>"
          );
        })
        .join("")
    : '<div class="empty"><h3>' +
      (location.pathname === "/saved-teams"
        ? "No saved teams yet."
        : "No teams found.") +
      '</h3><p>Explore active listings or post your own team need.</p><a href="/teams" data-route>Explore teams →</a></div>';
}
async function loadTeams() {
  const version = ++teamVersion,
    saved = location.pathname === "/saved-teams",
    myTeams = location.pathname === "/my-teams";
  if ((saved || myTeams) && !state.user) {
    $("teams-status").textContent = "Sign in to see your teams.";
    $("teams").innerHTML =
      '<div class="empty"><button data-auth-open>Sign In</button></div>';
    return;
  }
  $("teams-status").textContent = "Loading teams…";
  try {
    const mine = myTeams || (state.user && $("team-view-filter").value === "mine");
    let teams = await api(
      saved
        ? "/teams/saved"
        : mine
          ? "/teams/mine"
          : "/teams?search=" +
            encodeURIComponent($("team-search").value.trim()),
    );
    if ((mine || saved) && $("team-search").value.trim()) {
      const q = $("team-search").value.trim().toLowerCase();
      teams = teams.filter((t) =>
        [t.name, t.event, ...t.skillsNeeded, ...t.domains]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (version !== teamVersion) return;
    state.teamRequests = state.user ? await api("/team-requests") : [];
    if (version !== teamVersion) return;
    state.teams = teams;
    if (saved) state.savedTeams = teams;
    renderTeams();
    $("teams-status").textContent = teams.length + " team listings";
  } catch (error) {
    if (version !== teamVersion) return;
    $("teams-status").textContent = error.message;
    $("teams").innerHTML =
      '<div class="empty">Teams are unavailable. <button id="retry-teams">Try again</button></div>';
    $("retry-teams").onclick = loadTeams;
  }
}
function openTeam(team = null) {
  if (!state.user) return openAuth(() => openTeam(team));
  if (!state.profile) {
    toast("Publish your profile before creating a team.");
    return openProfile();
  }
  editingTeam = team;
  $("team-form").reset();
  void social.prepareTeam(team);
  if (team)
    for (const [key, value] of Object.entries(team)) {
      const field = $("team-form").elements.namedItem(key);
      if (field) field.value = Array.isArray(value) ? value.join(", ") : value;
    }
  $("team-error").textContent = "";
  $("team-dialog").showModal();
}
$("create-team").onclick = () => openTeam();
let teamTimer;
$("team-search").oninput = () => {
  clearTimeout(teamTimer);
  teamTimer = setTimeout(loadTeams, 300);
};
$("team-view-filter").onchange = loadTeams;
$("teams").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-team]"),
    del = event.target.closest("[data-delete-team]");
  if (edit) openTeam(state.teams.find((t) => t._id === edit.dataset.editTeam));
  if (del)
    askDelete(
      "Delete this team listing?",
      "This removes the team from the directory. Existing connections remain.",
      async () => {
        await api(`/teams/${del.dataset.deleteTeam}`, { method: "DELETE" });
        await loadTeams();
        toast("Team deleted.");
      },
    );
});
$("team-form").onsubmit = async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  values.openSlots = Number(values.openSlots);
  values.domains = csv(values.domains);
  values.skillsNeeded = csv(values.skillsNeeded);
  values.techStack = csv(values.techStack);
  $("save-team").disabled = true;
  $("team-error").textContent = "";
  try {
    const savedTeam = await send(
      editingTeam ? `/teams/${editingTeam._id}` : "/teams",
      values,
      editingTeam ? "PUT" : "POST",
    );
    const failedInvites = await social.inviteQueued(savedTeam);
    $("team-dialog").close();
    await loadTeams();
    if (!failedInvites) toast("Team saved. Selected invitations sent.");
  } catch (error) {
    $("team-error").textContent = error.message;
  } finally {
    $("save-team").disabled = false;
  }
};
document
  .querySelectorAll("[data-close]")
  .forEach(
    (button) => (button.onclick = () => $(button.dataset.close).close()),
  );
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  });
window.addEventListener("storage", (event) => {
  if (event.key === "reconnect_theme") applyTheme(event.newValue || "light");
  if (event.key === TOKEN_KEY) {
    clearSession(false);
    state.token = event.newValue;
    const cached = readSession(storage, state.token);
    state.user = cached?.user || null;
    state.profile = cached?.profile || null;
    renderAccount();
    if (state.token)
      hydrate().catch((error) => {
        toast(error.message);
      });
  }
});
const social = installSocialUI({ state, api, send, openAuth, toast, refreshNotifications, loadTeams });
const readiness = installReadiness({ state, api, send, openAuth, toast, renderTeams, openNotifications, social });
if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
  initDotMatrixCanvas();
renderAccount();
void social.restore();
loadProfiles();
renderRoute();
setupGoogle();
if (state.token)
  hydrate().catch((error) => {
    toast(error.message);
  });
setInterval(() => {
  if (document.hidden) return;
  refreshNotifications();
  if (!state.matches && location.pathname === "/") loadProfiles();
  if (location.pathname.startsWith("/profile/") && !$("profile-dialog").open)
    refreshPublic();
  if (
    ["/teams", "/saved-teams", "/my-teams"].includes(location.pathname) &&
    !$("team-dialog").open
  )
    loadTeams();
  if (
    ["/projects", "/hubs", "/calendar", "/mentorship"].includes(
      location.pathname,
    )
  )
    loadContent();
}, 45000);
async function refreshPublic() {
  const id = state.viewProfile?._id;
  if (!id) return;
  const version = routeVersion;
  try {
    const profile = await api(`/profiles/${id}`);
    if (version !== routeVersion) return;
    state.viewProfile = profile;
    renderViewedProfile();
  } catch (error) {
    if (version === routeVersion && error.status === 404) renderRoute();
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshNotifications();
    refreshPublic();
  }
});

$("mobile-menu-toggle").onclick = () => {
  const open = $("primary-links").classList.toggle("mobile-open");
  $("mobile-menu-toggle").setAttribute("aria-expanded", String(open));
};
document.addEventListener("keydown", (e) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    e.key.toLowerCase() === "k" &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    awaitHeroSearch();
  }
  if (e.key === "Escape") {

    $("primary-links").classList.remove("mobile-open");
    $("mobile-menu-toggle").setAttribute("aria-expanded", "false");
    $("account-menu").open = false;
  }
});
document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-auth-open]")) return openAuth();
  if (e.target.closest("[data-refresh-content]")) return loadContent();
  if (e.target.closest("[data-create-team]")) {
    navigate("/teams");
    return openTeam();
  }
  const college = e.target.closest("[data-college]");
  if (college) {
    $("filter-college").value = college.dataset.college;
    navigate("/#discovery");
    return loadProfiles();
  }
  const save = e.target.closest("[data-save-team]");
  if (save) {
    if (!state.user) return openAuth();
    save.disabled = true;
    const id = save.dataset.saveTeam,
      saved = state.savedTeams.some((t) => t._id === id);
    try {
      await send("/teams/" + id + "/save", {}, saved ? "DELETE" : "POST");
      state.savedTeams = await api("/teams/saved");
      if (location.pathname === "/saved-teams") await loadTeams();
      else renderTeams();
      toast(saved ? "Team removed from saved." : "Team saved.");
    } catch (error) {
      toast(error.message);
      save.disabled = false;
    }
  }

  if (!e.target.closest("#account-menu")) $("account-menu").open = false;
});
refreshHealth();
setInterval(() => {
  if (!document.hidden) refreshHealth();
}, 30000);

$("photo-picker").onclick = () => $("photo-file").click();
$("photo-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $("publish").disabled = true;
  $("photo-picker").disabled = true;
  $("photo-status").textContent = "Preparing photo…";
  try {
    const value = await compressPhoto(file);
    $("profile-form").elements.avatar.value = value;
    $("photo-preview").innerHTML = avatar({ avatar: value });
    $("photo-status").textContent = "Photo ready. Publish your profile to save.";
  } catch (error) { $("photo-status").textContent = error.message; }
  finally {
    event.target.value = "";
    $("publish").disabled = false;
    $("photo-picker").disabled = false;
  }
};

function openCommunity() {
  if (!state.user) return openAuth(openCommunity);
  $("community-error").textContent = "";
  $("community-dialog").showModal();
}
async function joinCommunity(code, button) {
  if (!state.user) return openAuth(() => joinCommunity(code, button));
  if (button) button.disabled = true;
  try {
    const community = await send(`/communities/${encodeURIComponent(code)}/join`);
    $("community-invite").close();
    $("notifications").close();
    toast(`You joined ${community.name}.`);
    navigate("/projects");
    await refreshNotifications();
  } catch (error) { toast(error.message); if (button) button.disabled = false; }
}
$("community-form").onsubmit = async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  values.tags = csv(values.tags);
  $("community-submit").disabled = true;
  try {
    const community = await send("/communities", values);
    $("community-dialog").close();
    event.target.reset();
    $("community-share").innerHTML = `<p>${escape(community.name)} is ready for collaborators.</p>${shareTools(community)}`;
    $("community-created").showModal();
    if (location.pathname === "/projects") await loadContent();
  } catch (error) { $("community-error").textContent = error.message; }
  finally { $("community-submit").disabled = false; }
};
document.addEventListener("click", async event => {
  if (event.target.closest("[data-create-community]")) return openCommunity();
  const join = event.target.closest("[data-join-community]");
  if (join) return joinCommunity(join.dataset.joinCommunity, join);
  const copy = event.target.closest("[data-copy-community]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(inviteUrl(copy.dataset.copyCommunity));
      copy.textContent = "Copied!";
      setTimeout(() => { copy.textContent = "Copy Invite Link"; }, 2000);
    } catch { toast("Copying is unavailable. Use Share on WhatsApp."); }
  }
});
const communityInviteCode = new URLSearchParams(location.search).get("joinCommunity") || location.pathname.match(/^\/community\/join\/([^/]+)$/)?.[1];
if (communityInviteCode) {
  $("community-invite-join").onclick = () => joinCommunity(communityInviteCode, $("community-invite-join"));
  $("community-invite").showModal();
}

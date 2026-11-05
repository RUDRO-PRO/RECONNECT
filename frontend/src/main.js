import "./style.css";
import { initDotMatrixCanvas } from "./canvas.js";
const $ = (id) => document.getElementById(id);
const state = {
  token: sessionStorage.getItem("talentbridge_token"),
  user: null,
  profile: null,
  profiles: [],
  invitations: [],
  notifications: [],
  matches: false,
  directoryLoaded: false,
};
let requestVersion = 0,
  toastTimer,
  searchTimer,
  polling = false;
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? escape(url.href) : "";
  } catch {
    return "";
  }
};
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({
      message: "The service is unavailable. Please try again.",
    }));
  if (!response.ok) {
    if (response.status === 401 && state.user) signOut();
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}
const post = (path, body = {}) =>
  api(path, { method: "POST", body: JSON.stringify(body) });
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function renderAccount() {
  $("account").hidden = !state.user;
  $("google-signin").hidden = !!state.user;
  $("connections-section").hidden = !state.user;
  $("account-name").textContent = state.user?.name || "";
  $("avatar").hidden = !safeUrl(state.user?.avatar);
  if (state.user?.avatar) $("avatar").src = state.user.avatar;
  $("create-profile").textContent = state.profile
    ? "Edit Profile"
    : "Create Profile";
  $("profile-auth-hint").textContent = state.user
    ? ""
    : "You can fill out your profile now. Sign in with Google in the navigation before publishing; your draft stays here.";
}
function signOut() {
  state.token = null;
  state.user = null;
  state.profile = null;
  state.invitations = [];
  state.notifications = [];
  sessionStorage.removeItem("talentbridge_token");
  window.google?.accounts.id.disableAutoSelect();
  $("notifications").close();
  $("profile-dialog").close();
  $("profile-form").reset();
  $("connections").replaceChildren();
  $("notification-list").replaceChildren();
  $("unread").textContent = "0";
  renderAccount();
  loadProfiles();
}
async function hydrate() {
  const token = state.token;
  const [user, profile, invitations] = await Promise.all([
    api("/auth/me"),
    api("/profiles/me"),
    api("/invitations"),
  ]);
  if (token !== state.token) return;
  state.user = user;
  state.profile = profile;
  state.invitations = invitations;
  renderAccount();
  renderProfiles();
  await refreshNotifications();
}
async function setupGoogle() {
  try {
    const config = await api("/config");
    if (!config.googleClientId)
      throw new Error("Google sign-in is not configured yet.");
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const check = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(check);
          resolve();
        } else if (++attempts > 100) {
          clearInterval(check);
          reject(
            new Error("Google sign-in could not load. Please reload to retry."),
          );
        }
      }, 100);
    });
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: async ({ credential }) => {
        try {
          const result = await post("/auth/google", { credential });
          state.token = result.token;
          sessionStorage.setItem("talentbridge_token", result.token);
          await hydrate();
          toast("Signed in successfully.");
        } catch (error) {
          toast(error.message);
        }
      },
    });
    $("google-signin").replaceChildren();
    google.accounts.id.renderButton($("google-signin"), {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
    });
  } catch (error) {
    $("google-signin").textContent = error.message;
  }
}
function invitationFor(profile) {
  return state.invitations.find(
    (i) => i.senderId === profile.userId || i.receiverId === profile.userId,
  );
}
function renderProfiles() {
  if (!state.directoryLoaded) return;
  if (!state.profiles.length) {
    $("profiles").innerHTML =
      `<div class="empty"><h3>${state.matches ? "No complementary builders found yet." : $("search").value.trim() ? "No builders match your search." : "No builders registered yet."}</h3><p>${state.matches ? "Check back as more builders join the community." : "Be the first to create a profile and let your work speak."}</p><button id="empty-create">Create Profile ↗</button></div>`;
    $("empty-create").onclick = openProfile;
    return;
  }
  $("profiles").innerHTML = state.profiles
    .map((p) => {
      const own = p.userId === state.user?.id,
        invitation = invitationFor(p);
      const label = own
        ? "Your profile"
        : invitation?.status === "accepted"
          ? "Connected ✓"
          : invitation?.status === "rejected"
            ? "Invitation declined"
            : invitation
              ? invitation.senderId === state.user?.id
                ? "Invited ✓"
                : "Respond in notifications"
              : "Invite to Team ↗";
      const incoming =
        invitation?.status === "pending" &&
        invitation.receiverId === state.user?.id;
      return `<article class="card"><span class="initial">${escape(p.fullName.charAt(0).toUpperCase())}</span><h3>${escape(p.fullName)}</h3><p>${escape(p.roleTag)}</p><div class="tags">${p.skills.map((s) => `<span class="tag">${escape(s)}</span>`).join("")}</div><p>${escape(p.proofOfWork)}</p><p class="availability">● ${escape(p.availabilityStatus)}</p>${p.matchReason ? `<p class="match-reason">${escape(p.matchReason)}</p>` : ""}<div class="card-links">${[
        ["githubUrl", "GitHub ↗"],
        ["portfolioUrl", "Portfolio / LeetCode ↗"],
      ]
        .map(([key, label]) =>
          safeUrl(p[key])
            ? `<a href="${safeUrl(p[key])}" target="_blank" rel="noopener noreferrer">${label}</a>`
            : "",
        )
        .join(
          "",
        )}</div><button data-invite="${escape(p.userId)}" ${incoming ? 'data-incoming="true"' : ""} ${own || (invitation && !incoming) ? "disabled" : ""}>${label}</button></article>`;
    })
    .join("");
}
async function loadProfiles() {
  const version = ++requestVersion;
  state.matches = false;
  $("directory-status").textContent = "Loading builders…";
  try {
    const profiles = await api(
      `/profiles?search=${encodeURIComponent($("search").value.trim())}`,
    );
    if (version !== requestVersion) return;
    state.directoryLoaded = true;
    state.profiles = profiles;
    renderProfiles();
    $("directory-status").textContent =
      `${profiles.length} builder${profiles.length === 1 ? "" : "s"}`;
  } catch (error) {
    if (version !== requestVersion) return;
    state.directoryLoaded = false;
    state.profiles = [];
    $("directory-status").textContent = "Directory unavailable";
    $("profiles").innerHTML =
      `<div class="empty"><h3>We couldn’t load the directory.</h3><p>${escape(error.message)}</p><button id="retry">Try again</button></div>`;
    $("retry").onclick = loadProfiles;
  }
}
function openProfile() {
  const form = $("profile-form");
  if (state.profile)
    for (const [key, value] of Object.entries(state.profile)) {
      if (form.elements.namedItem(key))
        form.elements.namedItem(key).value = Array.isArray(value)
          ? value.join(", ")
          : value;
    }
  else if (state.user && !form.elements.fullName.value)
    form.elements.fullName.value = state.user.name;
  $("profile-error").textContent = "";
  renderAccount();
  $("profile-dialog").showModal();
  form.elements.fullName.focus();
}
$("create-profile").onclick = openProfile;
$("close-profile").onclick = $("cancel-profile").onclick = () =>
  $("profile-dialog").close();
$("profile-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!state.user) {
    $("profile-error").textContent =
      "Sign in with Google in the navigation, then publish your saved draft.";
    return;
  }
  const values = Object.fromEntries(new FormData(event.target));
  values.skills = values.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  $("publish").disabled = true;
  $("profile-error").textContent = "";
  try {
    state.profile = await post("/profiles", values);
    $("profile-dialog").close();
    renderAccount();
    toast("Profile published.");
    $("search").value = "";
    await loadProfiles();
    $("discovery").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    $("profile-error").textContent = error.message;
  } finally {
    $("publish").disabled = false;
  }
};
$("profiles").onclick = async (event) => {
  const button = event.target.closest("[data-invite]");
  if (!button) return;
  if (button.dataset.incoming) return openNotifications();
  if (!state.user) return toast("Sign in with Google to invite builders.");
  button.disabled = true;
  try {
    const invitation = await post("/invitations", {
      receiverId: button.dataset.invite,
    });
    state.invitations.push(invitation);
    renderProfiles();
    toast("Invitation sent.");
  } catch (error) {
    toast(error.message);
    button.disabled = false;
    if (error.status === 409) {
      state.invitations = await api("/invitations").catch(
        () => state.invitations,
      );
      renderProfiles();
    }
  }
};
function renderNotifications() {
  $("unread").textContent = state.notifications.filter((n) => !n.read).length;
  $("notifications-toggle").setAttribute(
    "aria-label",
    `Notifications: ${$("unread").textContent} unread`,
  );
  $("notification-list").innerHTML = state.notifications.length
    ? state.notifications
        .map(
          (n) =>
            `<article class="notification"><p><strong>${escape(n.senderId?.name || "A builder")}</strong> ${n.type === "invitation" ? "invited you to join their team." : `${n.type === "accepted" ? "accepted" : "declined"} your invitation.`}</p><time>${escape(new Date(n.createdAt).toLocaleString())}</time>${n.type === "invitation" && n.invitationId?.status === "pending" ? `<button class="primary" data-response="accept" data-id="${n._id}">Accept</button><button data-response="decline" data-id="${n._id}">Decline</button>` : `<span class="muted">${escape(n.invitationId?.status || n.type)}</span>`}</article>`,
        )
        .join("")
    : '<p class="muted">No notifications yet. Your team invitations will appear here.</p>';
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
    $("notification-status").textContent =
      "Updated just now · refreshes every 15 seconds";
    $("connections").innerHTML = connections.length
      ? connections
          .map(
            (c) =>
              `<article class="card"><h3>${escape(c.name)}</h3><p>Invitation accepted. You can now plan your next build together.</p><a href="mailto:${escape(encodeURIComponent(c.email))}">${escape(c.email)}</a></article>`,
          )
          .join("")
      : '<p class="muted">Your accepted invitations will appear here.</p>';
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
      await post("/notifications/read", { ids });
      state.notifications.forEach((n) => {
        if (ids.includes(n._id)) n.read = true;
      });
      renderNotifications();
    } catch (error) {
      $("notification-status").textContent = error.message;
    }
}
$("notifications-toggle").onclick = openNotifications;
$("close-notifications").onclick = () => $("notifications").close();
$("notifications").addEventListener("close", () =>
  $("notifications-toggle").setAttribute("aria-expanded", "false"),
);
$("notification-list").onclick = async (event) => {
  const button = event.target.closest("[data-response]");
  if (!button) return;
  const buttons = [...button.parentElement.querySelectorAll("button")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await post(`/notifications/${button.dataset.id}/respond`, {
      action: button.dataset.response,
    });
    await refreshNotifications();
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
$("match").onclick = async () => {
  if (!state.user) return toast("Sign in and publish your profile first.");
  const version = ++requestVersion;
  $("match").disabled = true;
  $("directory-status").textContent = "Finding complementary skills…";
  try {
    const matches = await post("/match");
    if (version !== requestVersion) return;
    state.directoryLoaded = true;
    state.matches = true;
    state.profiles = matches;
    $("directory-status").textContent =
      `${matches.length} complementary match${matches.length === 1 ? "" : "es"}`;
    renderProfiles();
  } catch (error) {
    if (version === requestVersion)
      $("directory-status").textContent = error.message;
  } finally {
    $("match").disabled = false;
  }
};
$("show-all").onclick = () => {
  $("search").value = "";
  loadProfiles();
};
$("search-form").onsubmit = (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  loadProfiles();
  $("discovery").scrollIntoView({ behavior: "smooth" });
};
$("search").oninput = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProfiles, 300);
};
$("signout").onclick = signOut;
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
  initDotMatrixCanvas();
renderAccount();
loadProfiles();
setupGoogle();
if (state.token)
  hydrate().catch((error) => {
    if (error.status === 401) signOut();
    else toast(error.message);
  });
setInterval(() => {
  if (!document.hidden) refreshNotifications();
}, 15000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshNotifications();
});

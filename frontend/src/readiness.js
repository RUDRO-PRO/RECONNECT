import { $, escape, avatar, publicProfile } from "./ui.js";
export function teamControls(t, state) {
  const creator = String(t.creatorId || t.ownerId);
  const members = new Set([creator, ...(t.members || []).map(m => String(m.userId))]);
  const joined = members.has(state.user?.id), request = (state.teamRequests || []).find(r => String(r.teamId) === String(t._id));
  const label = joined ? "Joined ✓" : request?.status === "pending" ? "Request Sent ✓" : request?.status === "declined" ? "Request declined" : t.status !== "open" ? "Team closed" : "Request to Join";
  return `<div class="team-membership"><button data-team-roster="${escape(t._id)}">${members.size} ${members.size === 1 ? "Member" : "Members"}</button><button class="primary" data-request-team="${escape(t._id)}" ${joined || request || t.status !== "open" ? "disabled" : ""}>${label}</button></div>`;
}
export function installReadiness({ state, api, send, openAuth, toast, renderTeams, openNotifications, social }) {
  document.body.insertAdjacentHTML("beforeend", `<dialog id="builder-modal" class="builder-modal" aria-labelledby="builder-modal-title"><div class="dialog-heading"><h2 id="builder-modal-title">Builder Profile</h2><button data-ready-close="builder-modal" aria-label="Close builder profile">×</button></div><div id="builder-modal-content"></div></dialog><dialog id="team-roster" aria-labelledby="roster-title"><div class="dialog-heading"><h2 id="roster-title">Team members</h2><button data-ready-close="team-roster" aria-label="Close team members">×</button></div><div id="team-roster-content"></div></dialog>`);
  const viewport = window.visualViewport;
  const sizeSheets = () => {
    document.documentElement.style.setProperty("--sheet-height", `${viewport?.height || innerHeight}px`);
    document.documentElement.style.setProperty("--sheet-top", `${viewport?.offsetTop || 0}px`);
  };
  viewport?.addEventListener("resize", sizeSheets); viewport?.addEventListener("scroll", sizeSheets); window.addEventListener("resize", sizeSheets); sizeSheets();
  let profileEpoch = 0, rosterEpoch = 0, profileId = null;
  async function openBuilder(id) {
    profileId = id; const epoch = ++profileEpoch;
    $("builder-modal-content").textContent = "Loading profile…"; $("builder-modal").showModal();
    try { const profile = await api(`/profiles/${encodeURIComponent(id)}`); if (epoch === profileEpoch) $("builder-modal-content").innerHTML = publicProfile(profile, state); }
    catch (error) { if (epoch === profileEpoch) $("builder-modal-content").textContent = error.message; }
  }
  $("builder-modal").addEventListener("close", () => { ++profileEpoch; profileId = null; });
  $("team-roster").addEventListener("close", () => { ++rosterEpoch; });
  document.addEventListener("click", async event => {
    const close = event.target.closest("[data-ready-close]"); if (close) return $(close.dataset.readyClose).close();
    const builder = event.target.closest("[data-profile-modal]"); if (builder && !event.ctrlKey && !event.metaKey) { event.preventDefault(); return openBuilder(builder.dataset.profileModal); }
    const roster = event.target.closest("[data-team-roster]");
    if (roster) {
      const epoch = ++rosterEpoch; $("team-roster").showModal(); $("team-roster-content").textContent = "Loading members…";
      try {
        const result = await api(`/teams/${roster.dataset.teamRoster}/roster`); if (epoch !== rosterEpoch) return;
        $("roster-title").textContent = result.name;
        $("team-roster-content").innerHTML = result.members.map(m => `<div class="person-row">${avatar(m)}<div>${m.profileId ? `<a href="/profile/${escape(m.profileId)}" data-profile-modal="${escape(m.profileId)}"><strong>${escape(m.name)}</strong></a>` : `<strong>${escape(m.name)}</strong>`}<p>${m.lead ? "Admin / Lead" : escape(m.role)}</p>${m.headline ? `<p>${escape(m.headline)}</p>` : ""}</div></div>`).join("") || "No members to show.";
      } catch (error) { if (epoch === rosterEpoch) $("team-roster-content").textContent = error.message; }
    }
    const request = event.target.closest("[data-request-team]");
    if (request) {
      const act = async () => {
        request.disabled = true;
        try { const result = await send(`/teams/${request.dataset.requestTeam}/request-join`); state.teamRequests = [...(state.teamRequests || []).filter(r => String(r.teamId) !== String(result.teamId)), result]; renderTeams(); toast("Your request has been sent to the team lead."); }
        catch (error) { request.disabled = false; toast(error.message); }
      };
      if (!state.user) return openAuth(act); await act();
    }
    const quick = event.target.closest("[data-mobile-action]");
    if (quick) {
      $("primary-links").classList.remove("mobile-open"); $("mobile-menu-toggle").setAttribute("aria-expanded", "false");
      const action = quick.dataset.mobileAction;
      if (action === "theme") return $("theme-toggle").click();
      if (!state.user) return openAuth();
      if (action === "messages") $("messages-toggle").click();
      if (action === "notifications") openNotifications();
      if (action === "profile") $("my-profile").click();
    }
  });
  // Repaint action state after a connection response without overwriting scroll position.
  return { async refreshProfile() { if (!profileId || !$("builder-modal").open) return; const epoch = profileEpoch; try { const profile = await api(`/profiles/${profileId}`); if (epoch === profileEpoch) $("builder-modal-content").innerHTML = publicProfile(profile, state); } catch {} }, reset() { $("builder-modal").close(); $("team-roster").close(); } };
}

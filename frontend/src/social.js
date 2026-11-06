import { $, escape, avatar } from "./ui.js";
import { compressPhoto } from "./photo.js";
export function installSocialUI({ state, api, send, openAuth, toast, refreshNotifications, loadTeams }) {
  document.body.insertAdjacentHTML("beforeend", `
    <dialog id="room-dialog" class="chat-dialog" aria-labelledby="room-title"><div class="dialog-heading"><div><h2 id="room-title">Community</h2><p id="room-admin" class="muted"></p></div><button data-social-close="room-dialog" aria-label="Close room">×</button></div><button id="room-members">Members</button><p id="room-status" role="status"></p><div id="room-feed" class="message-feed" aria-label="Community messages"></div><form id="room-compose"><label>Message<textarea name="text" maxlength="5000" rows="2" placeholder="Share an idea with your community..."></textarea></label><div id="room-image-preview"></div><div class="toolbar"><button type="button" id="room-attach">Attach image</button><input type="file" id="room-image" accept="image/*" hidden><button type="button" id="room-remove-image" hidden>Remove image</button><button class="primary" id="room-send">Send</button></div></form></dialog>
    <dialog id="members-dialog" aria-labelledby="members-title"><div class="dialog-heading"><h2 id="members-title">Members</h2><button data-social-close="members-dialog" aria-label="Close members">×</button></div><div id="room-member-list" class="people-list"></div><h3>Invite / Add Member</h3><label>Search Reconnect builders<input id="member-search" placeholder="Search by name or skill..."></label><div id="member-results" class="people-list" role="status"></div></dialog>
    <dialog id="dm-dialog" class="chat-dialog dm-dialog" aria-labelledby="dm-title"><div class="dialog-heading"><h2 id="dm-title">Direct Messages</h2><button data-social-close="dm-dialog" aria-label="Close messages">×</button></div><div class="dm-layout"><aside><label>Search connections<input id="dm-search" placeholder="Find a connection..."></label><div id="dm-conversations" class="people-list"></div></aside><section><h3 id="dm-person">Choose a connection</h3><p id="dm-status" role="status"></p><div id="dm-feed" class="message-feed" aria-label="Direct messages"></div><form id="dm-compose" hidden><label>Message<textarea name="text" required maxlength="5000" rows="2" placeholder="Start a conversation..."></textarea></label><button class="primary" id="dm-send">Send message</button></form></section></div></dialog>
    <dialog id="connection-note" aria-labelledby="note-title"><div class="dialog-heading"><h2 id="note-title">Connect with this builder</h2><button data-social-close="connection-note" aria-label="Cancel invitation">×</button></div><form id="note-form"><label>Optional introduction<textarea id="note-text" maxlength="1000" rows="4" placeholder="Hey, I am building an AI project. Let's connect!"></textarea></label><p class="muted">Your note accompanies the invitation and opens your conversation after they accept.</p><button class="primary">Send connection request</button></form></dialog>`);
  let currentRoom = null, roomCode = null, imageUrl = "", roomEpoch = 0, dmEpoch = 0;
  let people = [], selectedPerson = null, noteResolve = null;
  let team = null, teamPeople = [], queued = new Set(), invited = new Set(), teamEpoch = 0;
  let refreshing = false, searching = 0, searchTimer;
  const matches = (p, query) => [p.name, p.headline, ...(p.skills || []).map(s => s.name || s)].join(" ").toLowerCase().includes(query.toLowerCase());
  function messageHtml(m, group) {
    const sender = group ? m.senderId?._id : m.senderId;
    return `<article class="chat-message ${String(sender) === state.user?.id ? "mine" : ""}">${group ? `<strong>${escape(m.senderId?.name || "Former member")}</strong>` : ""}${m.text ? `<p class="preserve-lines">${escape(m.text)}</p>` : ""}${m.imageUrl ? `<img class="chat-image" src="${escape(m.imageUrl)}" alt="Shared community attachment" loading="lazy">` : ""}<time>${escape(new Date(m.createdAt).toLocaleString())}</time></article>`;
  }
  function feed(element, messages, group) {
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 70;
    const html = messages.map(m => messageHtml(m, group)).join("") || '<p class="muted">No messages yet. Start the conversation.</p>';
    if (element.innerHTML !== html) { element.innerHTML = html; if (atBottom) element.scrollTop = element.scrollHeight; }
  }
  async function refreshRoom() {
    if (!currentRoom || !$("room-dialog").open) return;
    const epoch = roomEpoch, roomId = currentRoom._id;
    try {
      const [room, messages] = await Promise.all([api(`/communities/${roomId}`), api(`/communities/${roomId}/messages`)]);
      if (epoch !== roomEpoch || !$("room-dialog").open) return;
      currentRoom = room;
      $("room-title").textContent = room.name;
      $("room-admin").textContent = `Created by ${room.creatorId?.name || "Admin"} · Admin`;
      $("room-members").textContent = `${room.members.length} Members`;
      $("room-status").textContent = "";
      feed($("room-feed"), messages, true);
      if ($("members-dialog").open) renderMembers();
    } catch (error) {
      if (epoch !== roomEpoch) return;
      $("room-status").textContent = error.message;
      if ([403, 404].includes(error.status)) {
        $("room-feed").replaceChildren(); $("room-compose").hidden = true; $("room-members").disabled = true; $("members-dialog").close();
      }
    }
  }
  async function openRoom(id, code) {
    if (!state.user) return openAuth(() => openRoom(id, code));
    ++roomEpoch; currentRoom = { _id: id }; roomCode = code; imageUrl = "";
    $("room-feed").replaceChildren(); $("room-title").textContent = "Community"; $("room-admin").textContent = "";
    $("room-compose").reset(); $("room-image-preview").replaceChildren(); $("room-remove-image").hidden = true;
    $("room-compose").hidden = true; $("room-members").disabled = true;
    $("room-status").textContent = "Loading room…"; $("room-dialog").showModal();
    const epoch = roomEpoch;
    try {
      const loaded = await api(`/communities/${id}`);
      if (epoch !== roomEpoch) return;
      currentRoom = loaded;
      $("room-compose").hidden = false; $("room-members").disabled = false;
      await refreshRoom();
    } catch (error) {
      if (epoch !== roomEpoch) return;
      $("room-status").textContent = error.message;
      if (error.status === 403 && code) $("room-status").insertAdjacentHTML("beforeend", '<button id="room-join" class="primary">Join Community</button>');
    }
  }
  function renderMembers() {
    if (!currentRoom?.members) return;
    const admin = String(currentRoom.creatorId?._id);
    const html = currentRoom.members.map(m => `<div class="person-row">${avatar(m)}<div><strong>${escape(m.name)}</strong><p>${escape(m.roleTag || "Builder")}${String(m._id) === admin ? " · Admin" : ""}</p></div>${state.user?.id === admin && String(m._id) !== admin ? `<button class="remove-member" data-remove-member="${m._id}">Remove</button>` : ""}</div>`).join("");
    if ($("room-member-list").innerHTML !== html) $("room-member-list").innerHTML = html;
  }
  $("room-members").onclick = () => { renderMembers(); $("member-search").value = ""; $("member-results").replaceChildren(); $("members-dialog").showModal(); };
  $("member-search").oninput = () => {
    clearTimeout(searchTimer); const epoch = ++searching, roomId = currentRoom?._id;
    searchTimer = setTimeout(async () => {
      const query = $("member-search").value.trim(); if (!query) { $("member-results").replaceChildren(); return; }
      try {
        const profiles = await api(`/profiles?search=${encodeURIComponent(query)}`);
        if (epoch !== searching || roomId !== currentRoom?._id) return;
        const members = new Set(currentRoom.members.map(m => String(m._id)));
        $("member-results").innerHTML = profiles.filter(p => !members.has(String(p.userId))).slice(0, 30).map(p => `<div class="person-row">${avatar(p)}<div><strong>${escape(p.fullName)}</strong><p>${escape(p.headline)}</p></div><button data-add-member="${p.userId}">Add</button></div>`).join("") || '<p class="muted">No other builders found.</p>';
      } catch (error) { if (epoch === searching) $("member-results").textContent = error.message; }
    }, 250);
  };
  $("room-attach").onclick = () => $("room-image").click();
  $("room-image").onchange = async event => {
    const file = event.target.files[0], epoch = roomEpoch; if (!file) return;
    $("room-send").disabled = true;
    try {
      const value = await compressPhoto(file, 800);
      if (epoch !== roomEpoch) return;
      imageUrl = value; $("room-image-preview").innerHTML = `<img class="attachment-preview" src="${value}" alt="Attachment preview">`; $("room-remove-image").hidden = false;
    } catch (error) { toast(error.message); }
    finally { event.target.value = ""; $("room-send").disabled = false; }
  };
  $("room-remove-image").onclick = () => { imageUrl = ""; $("room-image-preview").replaceChildren(); $("room-remove-image").hidden = true; };
  $("room-compose").onsubmit = async event => {
    event.preventDefault(); const epoch = roomEpoch;
    $("room-send").disabled = true;
    try {
      await send(`/communities/${currentRoom._id}/messages`, { text: event.target.elements.text.value, imageUrl });
      if (epoch !== roomEpoch) return;
      event.target.reset(); $("room-remove-image").click(); await refreshRoom(); $("room-feed").scrollTop = $("room-feed").scrollHeight;
    } catch (error) { $("room-status").textContent = error.message; }
    finally { $("room-send").disabled = false; }
  };
  function renderConversations() {
    const query = $("dm-search").value;
    const html = people.filter(p => matches(p, query)).map(p => `<button class="conversation person-row ${selectedPerson?.id === p.id ? "selected" : ""}" data-dm-person="${p.id}">${avatar(p)}<span><strong>${escape(p.name)}${p.unread ? ` · ${p.unread} unread` : ""}</strong><small>${escape(p.latestMessage || p.headline || "Start a conversation")}</small></span></button>`).join("") || '<p class="muted">No connections found. Connect with builders to message them.</p>';
    if ($('dm-conversations').innerHTML !== html) $('dm-conversations').innerHTML = html;
  }
  async function refreshConversations() {
    if (!state.user) return;
    const token = state.token;
    try {
      const result = await api("/messages/conversations"); if (token !== state.token) return;
      people = result.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      $("messages-unread").textContent = people.reduce((sum, p) => sum + p.unread, 0);
      if ($("dm-dialog").open) renderConversations();
    } catch (error) { if ($("dm-dialog").open) $("dm-status").textContent = error.message; }
  }
  async function refreshThread() {
    if (!selectedPerson || !$("dm-dialog").open) return;
    const epoch = dmEpoch, other = selectedPerson.id;
    try {
      const messages = await api(`/messages/${other}`);
      if (epoch !== dmEpoch || !$("dm-dialog").open) return;
      feed($("dm-feed"), messages, false); $("dm-status").textContent = "";
      await refreshConversations();
    } catch (error) { if (epoch === dmEpoch) $("dm-status").textContent = error.message; }
  }
  $("messages-toggle").onclick = async () => { $("dm-dialog").showModal(); await refreshConversations(); await refreshThread(); };
  $("dm-search").oninput = renderConversations;
  $("dm-compose").onsubmit = async event => {
    event.preventDefault(); const epoch = dmEpoch; $("dm-send").disabled = true;
    try {
      await send(`/messages/${selectedPerson.id}`, { text: event.target.elements.text.value });
      if (epoch !== dmEpoch) return;
      event.target.reset(); await refreshThread(); $("dm-feed").scrollTop = $("dm-feed").scrollHeight;
    } catch (error) { $("dm-status").textContent = error.message; }
    finally { $("dm-send").disabled = false; }
  };
  function renderTeamPeople() {
    $("team-connection-list").innerHTML = teamPeople.filter(p => matches(p, $("team-connection-search").value)).map(p => {
      const member = team?.members?.some(m => String(m.userId) === p.id), sent = invited.has(p.id);
      return `<div class="person-row">${avatar(p)}<div><strong>${escape(p.name)}</strong><p>${escape(p.headline)}</p></div><button type="button" data-team-invite="${p.id}" ${member || sent ? "disabled" : ""}>${member ? "Member" : sent ? "Invited ✓" : queued.has(p.id) ? "Selected · Undo" : "Invite"}</button></div>`;
    }).join("") || '<p class="muted">No matching connections. Connect with builders first.</p>';
  }
  async function prepareTeam(value) {
    const epoch = ++teamEpoch; team = value; teamPeople = []; queued.clear(); invited.clear(); $("team-connection-search").value = "";
    $("team-invite-help").textContent = value ? "Invite connected builders to this team." : "Selected invitations will be sent after your team is saved.";
    $("team-connection-list").textContent = "Loading connections…";
    try {
      const [connections, invitations] = await Promise.all([api("/connections"), value ? api(`/teams/${value._id}/invites`) : []]);
      if (epoch !== teamEpoch) return;
      teamPeople = connections; invited = new Set(invitations.map(n => String(n.recipientId))); renderTeamPeople();
    } catch (error) { if (epoch === teamEpoch) $("team-connection-list").textContent = error.message; }
  }
  $("team-connection-search").oninput = renderTeamPeople;
  $("note-form").onsubmit = event => { event.preventDefault(); const resolve = noteResolve; noteResolve = null; resolve?.($("note-text").value); $("connection-note").close(); };
  $("connection-note").addEventListener("close", () => { noteResolve?.(null); noteResolve = null; });
  $("room-dialog").addEventListener("close", () => { ++roomEpoch; currentRoom = null; imageUrl = ""; $("members-dialog").close(); });
  $("dm-dialog").addEventListener("close", () => { ++dmEpoch; });
  document.addEventListener("click", async event => {
    const close = event.target.closest("[data-social-close]"); if (close) return $(close.dataset.socialClose).close();
    const roomButton = event.target.closest("[data-open-community]"); if (roomButton) return openRoom(roomButton.dataset.openCommunity, roomButton.dataset.code);
    const action = event.target.closest("[data-remove-member], [data-add-member], [data-dm-person], [data-team-invite], [data-team-response], #room-join"); if (!action) return;
    action.disabled = true;
    try {
      if (action.id === "room-join") { await send(`/communities/${roomCode}/join`); return openRoom(currentRoom._id, roomCode); }
      if (action.dataset.removeMember) { await send(`/communities/${currentRoom._id}/members/${action.dataset.removeMember}`, {}, "DELETE"); await refreshRoom(); }
      if (action.dataset.addMember) { await send(`/communities/${currentRoom._id}/add-member`, { userId: action.dataset.addMember }); action.textContent = "Added"; await refreshRoom(); return; }
      if (action.dataset.dmPerson) {
        ++dmEpoch; selectedPerson = people.find(p => p.id === action.dataset.dmPerson);
        $("dm-person").textContent = selectedPerson.name; $("dm-compose").hidden = false; $("dm-compose").reset(); $("dm-feed").replaceChildren(); renderConversations(); await refreshThread();
      }
      if (action.dataset.teamInvite) {
        const userId = action.dataset.teamInvite;
        if (team) { await send(`/teams/${team._id}/invite`, { userId }); invited.add(userId); }
        else queued.has(userId) ? queued.delete(userId) : queued.add(userId);
        renderTeamPeople();
      }
      if (action.dataset.teamResponse) { await send(`/team-invitations/${action.dataset.id}/respond`, { action: action.dataset.teamResponse }); await refreshNotifications(); if (["/teams", "/my-teams"].includes(location.pathname)) await loadTeams(); }
    } catch (error) { toast(error.message); }
    finally { if (action.isConnected) action.disabled = false; }
  });
  setInterval(async () => {
    if (document.hidden || !state.user || refreshing) return; refreshing = true;
    try { await Promise.all([refreshRoom(), $("dm-dialog").open && selectedPerson ? refreshThread() : refreshConversations()]); }
    finally { refreshing = false; }
  }, 6000);
  async function openDirect(userId) {
    if (!state.user) return openAuth(() => openDirect(userId));
    $("dm-dialog").showModal(); await refreshConversations();
    const person = people.find(p => p.id === userId);
    if (!person) { $("dm-status").textContent = "Connect with this builder to start a conversation."; return; }
    ++dmEpoch; selectedPerson = person; $("dm-person").textContent = person.name;
    $("dm-compose").hidden = false; $("dm-compose").reset(); $("dm-feed").replaceChildren(); renderConversations(); await refreshThread();
  }
  document.addEventListener("click", event => { const button = event.target.closest("[data-message]"); if (button) void openDirect(button.dataset.message); });
  return {
    openDirect,
    prepareTeam,
    async inviteQueued(saved) {
      const failed = [];
      for (const userId of queued) { try { await send(`/teams/${saved._id}/invite`, { userId }); } catch { failed.push(userId); } }
      queued.clear(); if (failed.length) toast(`Team saved, but ${failed.length} invitation(s) failed. Reopen the team to retry.`);
      return failed.length;
    },
    requestNote() { $("note-text").value = ""; $("connection-note").showModal(); return new Promise(resolve => { noteResolve = resolve; }); },
    reset() { ++roomEpoch; ++dmEpoch; ++teamEpoch; ++searching; currentRoom = null; selectedPerson = null; people = []; teamPeople = []; queued.clear(); invited.clear(); imageUrl = ""; for (const dialog of ["room-dialog", "members-dialog", "dm-dialog", "connection-note"]) $(dialog).close(); for (const element of ["room-feed", "room-member-list", "member-results", "dm-feed", "dm-conversations", "team-connection-list"]) $(element).replaceChildren(); $("dm-compose").reset(); $("dm-compose").hidden = true; $("messages-unread").textContent = "0"; },
  };
}

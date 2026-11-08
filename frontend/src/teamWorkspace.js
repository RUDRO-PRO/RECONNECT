import { mergeMessages, cursorQuery } from "./messages.js";
import { $, escape, avatar, safeUrl } from './ui.js';
import { compressPhoto } from './photo.js';
const stages = ['Ideation', 'Architecture & Design', 'Building MVP', 'Testing & Polish', 'Pitch Ready'];
const mediaUrl = value => /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value || '') ? value : safeUrl(value);
export function installTeamWorkspace({ state, api, send, openAuth, toast, onActivity = () => {} }) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="workspace" class="workspace" aria-labelledby="workspace-title">
    <header class="dialog-heading"><div><p class="eyebrow">HACKATHON WAR ROOM</p><h2 id="workspace-title">Team workspace</h2><p id="workspace-event" class="muted"></p></div><button id="workspace-close" aria-label="Close workspace">×</button></header>
    <div id="workspace-members" class="workspace-members"></div>
    <nav class="workspace-tabs" aria-label="Workspace sections"><button data-work-tab="chat" aria-pressed="true">Discussion</button><button data-work-tab="progress" aria-pressed="false">Project progress</button><button data-work-tab="assets" aria-pressed="false">Photos & assets</button></nav>
    <p id="workspace-status" role="status"></p>
    <section id="workspace-chat"><div id="workspace-feed" class="message-feed" role="log" aria-label="Team discussion"></div>
      <form id="workspace-compose"><label>Message your team<textarea name="text" maxlength="5000" rows="2" placeholder="Share an idea, ask for feedback, keep building..."></textarea></label><div class="toolbar"><label class="workspace-file">Attach image<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><button class="primary">Send message</button></div></form></section>
    <section id="workspace-progress" hidden><div id="workspace-stages" class="workspace-stages"></div><div class="workspace-meter"><div id="workspace-bar"></div></div><p id="workspace-percent"></p>
      <form id="workspace-goal"><label>Progress (%)<input name="progressPercent" type="number" min="0" max="100" required></label><label>Current sprint goal<textarea name="currentSprintGoal" maxlength="1000" rows="2" placeholder="What will your team ship next?"></textarea></label><button class="primary">Save progress</button></form>
      <h3>Team milestones</h3><div id="workspace-milestones"></div><form id="workspace-task" class="workspace-task"><label>New milestone<input name="title" required maxlength="200" placeholder="Prepare a working demo"></label><label>Assignee<input name="assigneeName" maxlength="100" placeholder="Team member (optional)"></label><button>Add milestone</button></form></section>
    <section id="workspace-assets" hidden><div id="workspace-gallery" class="workspace-gallery"></div><h3>Share an asset</h3><p class="muted">Up to 8 shared assets. Upload an image or paste a link.</p><form id="workspace-upload"><label>Title<input name="title" required maxlength="150"></label><label>Caption<textarea name="caption" maxlength="1000" rows="2"></textarea></label><label>Photo or screenshot<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><label>Or external asset URL<input name="imageUrl" type="url" placeholder="https://..."></label><button class="primary">Share asset</button></form></section>
    </dialog><dialog id="workspace-lightbox" class="workspace-lightbox" aria-label="Asset preview"><button id="workspace-lightbox-close" aria-label="Close preview">×</button><div id="workspace-preview"></div></dialog>`);
  let teamId = null, workspace = null, epoch = 0, chatCursor = null, tab = 'chat', pending = [], goalDirty = false, readVersion = 0, assetImages = new Map();
  const current = (version, token) => version === epoch && token === state.token && $('workspace').open;
  function renderFeed() {
    const feed = $('workspace-feed'), bottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
    const saved = workspace?.messages || [];
    const messages = [...saved, ...pending.filter(p => !saved.some(m => m.clientMessageId === p.clientMessageId))];
    const html = messages.map(m => `<article class="chat-message ${m.senderId === state.user?.id ? 'mine' : ''}"><div class="workspace-sender">${avatar({ name: m.senderName, avatar: workspace?.members.find(person => String(person.userId) === String(m.senderId))?.avatar || m.senderAvatar })}<strong>${escape(m.senderName)}</strong></div><p class="preserve-lines">${escape(m.text)}</p>${m.attachmentUrl ? `<a href="${mediaUrl(m.attachmentUrl)}" target="_blank" rel="noopener noreferrer"><img class="chat-image" src="${mediaUrl(m.attachmentUrl)}" alt="Team attachment" loading="lazy"></a>` : ''}<small>${m.failed ? 'Not sent — copy your message and try again' : m.pending ? 'Sending…' : escape(new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</small></article>`).join('') || '<p class="empty">Your next big idea starts here. Say hello to the team.</p>';
    if (feed.innerHTML !== html) { feed.innerHTML = html; if (bottom) feed.scrollTop = feed.scrollHeight; }
  }
  function render() {
    if (!workspace) return;
    workspace.assets = (workspace.assets || []).map(a => ({ ...a, imageUrl: a.imageUrl || assetImages.get(a._id) || "" }));
    $('workspace-title').textContent = workspace.name; $('workspace-event').textContent = workspace.hackathonName || workspace.event;
    $('workspace-members').innerHTML = workspace.members.map(m => `<span class="workspace-member">${avatar(m)}<span>${escape(m.name || 'Former member')}<small>${escape(m.role || 'Member')}</small></span></span>`).join('');
    renderFeed();
    $('workspace-stages').innerHTML = stages.map((s, i) => `<button data-work-stage="${i}" aria-pressed="${workspace.projectState === s}" class="${i <= stages.indexOf(workspace.projectState) ? 'reached' : ''}"><span>${i + 1}</span>${escape(s)}</button>`).join('');
    $('workspace-bar').style.width = `${workspace.progressPercent}%`; $('workspace-percent').textContent = `${workspace.progressPercent}% complete · ${workspace.projectState}`;
    if (!goalDirty) { $('workspace-goal').elements.progressPercent.value = workspace.progressPercent; $('workspace-goal').elements.currentSprintGoal.value = workspace.currentSprintGoal || ''; }
    $('workspace-milestones').innerHTML = (workspace.milestones || []).map(m => `<label class="workspace-milestone"><input type="checkbox" data-work-task="${escape(m._id)}" ${m.completed ? 'checked' : ''}><span>${escape(m.title)}<small>${escape(m.assigneeName || 'Unassigned')}</small></span></label>`).join('') || '<p class="muted">Break your sprint into small, achievable milestones.</p>';
    const gallery = (workspace.assets || []).map(a => `<article class="workspace-asset"><button data-work-preview="${escape(a._id)}">${a.imageUrl ? `<img src="${mediaUrl(a.imageUrl)}" alt="${escape(a.title)}" loading="lazy">` : `<span class="asset-placeholder">Open preview</span>`}<strong>${escape(a.title)}</strong></button><p>${escape(a.caption)}</p><small>Shared by ${escape(a.uploadedByName)}</small><div>${a.imageUrl ? `<a href="${mediaUrl(a.imageUrl)}" target="_blank" rel="noopener noreferrer">Open asset</a>` : `<span class="muted">Loading preview…</span>`}<button data-work-delete="${escape(a._id)}">Remove</button></div></article>`).join('') || '<p class="empty">Give your project a visual home. Share your first screenshot, diagram or demo.</p>';
    if ($('workspace-gallery').innerHTML !== gallery) $('workspace-gallery').innerHTML = gallery;
  }
  async function refresh() {
    const version = epoch, token = state.token, read = ++readVersion;
    if (!teamId || !$('workspace').open) return;
    try {
      const result = await api(`/teams/${teamId}/workspace`);
      if (!current(version, token) || read !== readVersion) return;
      $('workspace-earlier').hidden = result.messages.length < 30; workspace = result; chatCursor = result.messages.at(-1) || null; render(); $('workspace-status').textContent = ''; if (tab === 'assets') void loadAssetImages();
    } catch (error) { if (current(version, token)) { $('workspace-status').textContent = error.message; if ([401, 403].includes(error.status)) reset(); } }
  }
  async function loadAssetImages() {
    const version = epoch, token = state.token;
    for (const asset of workspace?.assets || []) {
      if (!current(version, token) || tab !== 'assets') return;
      if (assetImages.has(asset._id)) continue;
      try { const detail = await api(`/teams/${teamId}/assets/${asset._id}`); if (!current(version, token)) return; assetImages.set(asset._id, detail.imageUrl); render(); }
      catch (error) { if (current(version, token)) $('workspace-status').textContent = error.message; }
    }
  }
  function schedule() { onActivity(); }
  async function refreshMessages() {
    const version = epoch, token = state.token;
    const messages = await api(`/teams/${teamId}/messages${cursorQuery(chatCursor)}`);
    if (!current(version, token) || !workspace) return;
    workspace.messages = mergeMessages(workspace.messages, messages);
    if (messages.length) chatCursor = messages.at(-1);
    renderFeed();
  }
  async function open(id) {
    if (!state.user) return openAuth(() => open(id));
    ++epoch; $("dm-dialog")?.close(); $("room-dialog")?.close(); teamId = id; chatCursor = null; assetImages = new Map(); workspace = null; pending = []; goalDirty = false;
    $('workspace-title').textContent = 'Team workspace'; $('workspace-status').textContent = 'Loading your team…';
    for (const id of ['workspace-members', 'workspace-feed', 'workspace-stages', 'workspace-milestones', 'workspace-gallery']) $(id).replaceChildren();
    $('workspace-goal').reset(); $('workspace-compose').reset(); $('workspace-upload').reset(); $('workspace-task').reset();
    selectTab('chat'); if (!$('workspace').open) $('workspace').showModal(); await refresh(); schedule();
  }
  function reset() { ++epoch; teamId = null; chatCursor = null; assetImages.clear(); workspace = null; pending = []; $('workspace').close(); $('workspace-lightbox').close(); schedule(); }
  function selectTab(value) { tab = value; for (const name of ['chat', 'progress', 'assets']) { $(`workspace-${name}`).hidden = name !== tab; document.querySelector(`[data-work-tab="${name}"]`).setAttribute('aria-pressed', String(name === tab)); } if (workspace && tab !== 'chat') void refresh(); schedule(); }
  $('workspace-close').onclick = reset; $('workspace').addEventListener('close', () => { if (teamId) reset(); });
  $('workspace-lightbox-close').onclick = () => $('workspace-lightbox').close();

  async function mutate(suffix, body, method = 'POST') { const version = epoch, token = state.token; await send(`/teams/${teamId}/${suffix}`, body, method); if (current(version, token)) await refresh(); }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-open-workspace], [data-work-tab], [data-work-stage], [data-work-delete], [data-work-preview]'); if (!button) return;
    if (button.dataset.openWorkspace) return open(button.dataset.openWorkspace);
    if (button.dataset.workTab) return selectTab(button.dataset.workTab);
    if (!workspace) return;
    const version = epoch, token = state.token;
    button.disabled = true;
    try {
      if (button.dataset.workStage !== undefined) await mutate('progress', { projectState: stages[Number(button.dataset.workStage)] }, 'PATCH');
      if (button.dataset.workDelete) await mutate(`assets/${button.dataset.workDelete}`, {}, 'DELETE');
      if (button.dataset.workPreview) { const asset = workspace.assets.find(a => a._id === button.dataset.workPreview); if (!asset.imageUrl) { const detail = await api(`/teams/${teamId}/assets/${asset._id}`); if (!current(version, token)) return; asset.imageUrl = detail.imageUrl; assetImages.set(asset._id, detail.imageUrl); } $('workspace-preview').innerHTML = `<img src="${mediaUrl(asset.imageUrl)}" alt="${escape(asset.title)}"><h3>${escape(asset.title)}</h3><p>${escape(asset.caption)}</p><a href="${mediaUrl(asset.imageUrl)}" target="_blank" rel="noopener noreferrer">Open original asset</a>`; $('workspace-lightbox').showModal(); }
    } catch (error) { toast(error.message); } finally { button.disabled = false; }
  });
  $('workspace-milestones').onchange = async event => { const input = event.target; if (!input.dataset.workTask) return; input.disabled = true; try { await mutate('progress', { milestone: { _id: input.dataset.workTask, completed: input.checked } }, 'PATCH'); } catch (error) { input.checked = !input.checked; toast(error.message); } finally { input.disabled = false; } };
  $('workspace-goal').oninput = () => { goalDirty = true; };
  for (const [id, suffix, method, data] of [
    ['workspace-goal', 'progress', 'PATCH', f => ({ progressPercent: Number(f.elements.progressPercent.value), currentSprintGoal: f.elements.currentSprintGoal.value })],
    ['workspace-task', 'progress', 'PATCH', f => ({ milestone: { title: f.elements.title.value, assigneeName: f.elements.assigneeName.value } })],
    ['workspace-upload', 'assets', 'POST', async f => ({ title: f.elements.title.value, caption: f.elements.caption.value, imageUrl: f.elements.image.files[0] ? await compressPhoto(f.elements.image.files[0], 1400) : f.elements.imageUrl.value })],
  ]) $(id).onsubmit = async event => {
    event.preventDefault(); if (!workspace) return;
    const form = event.target, button = form.querySelector('button'), version = epoch, target = teamId, token = state.token; button.disabled = true;
    try { const body = await data(form); if (!current(version, token)) return; await send(`/teams/${target}/${suffix}`, body, method); if (!current(version, token)) return; if (id === 'workspace-goal') goalDirty = false; else form.reset(); await refresh(); }
    catch (error) { if (current(version, token)) toast(error.message); } finally { button.disabled = false; }
  };
  $('workspace-compose').onsubmit = async event => {
    event.preventDefault(); if (!workspace) return;
    const form = event.target, message = form.elements.text.value.trim(), file = form.elements.image.files[0]; if (!message && !file) return;
    const version = epoch, token = state.token, target = teamId, clientMessageId = crypto.randomUUID();
    const optimistic = { clientMessageId, text: message, senderId: state.user.id, senderName: state.user.name, senderAvatar: state.user.avatar, createdAt: new Date().toISOString(), pending: true };
    pending.push(optimistic); form.reset(); renderFeed(); $('workspace-feed').scrollTop = $('workspace-feed').scrollHeight;
    try {
      const attachmentUrl = file ? await compressPhoto(file, 1400) : ''; if (!current(version, token)) return;
      optimistic.attachmentUrl = attachmentUrl; renderFeed();
      const saved = await send(`/teams/${target}/messages`, { text: message, attachmentUrl, clientMessageId });
      if (!current(version, token)) return;
      ++readVersion; pending = pending.filter(m => m !== optimistic); if (!workspace.messages.some(m => m._id === saved._id)) workspace.messages.push(saved); renderFeed();
    } catch (error) { if (current(version, token)) { optimistic.pending = false; optimistic.failed = true; renderFeed(); toast(error.message); } }
  };
  $('workspace-feed').insertAdjacentHTML('beforebegin', '<button id="workspace-earlier" hidden>Load earlier messages</button>');
  $('workspace-earlier').onclick = async () => {
    const version = epoch, token = state.token, button = $('workspace-earlier'); button.disabled = true;
    try { const messages = await api(`/teams/${teamId}/messages${cursorQuery(workspace.messages[0], 'before')}`); if (!current(version, token)) return; workspace.messages = mergeMessages(workspace.messages, messages); renderFeed(); button.hidden = messages.length < 30; }
    catch (error) { toast(error.message); } finally { button.disabled = false; }
  };
  return { reset, open, activePoll: () => teamId && workspace && $('workspace').open && tab === 'chat' ? refreshMessages : null,
    refreshOpen: async () => { if (teamId && $('workspace').open && tab !== 'chat') await refresh(); } };

}

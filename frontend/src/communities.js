import { escape, tags } from "./ui.js";
export const inviteUrl = code => `${window.location.origin}/?joinCommunity=${encodeURIComponent(code)}`;
export function shareTools(c) {
  const url = inviteUrl(c.inviteCode);
  const message = `Join ${c.name} on Reconnect. Connect and collaborate with like-minded builders: ${url}`;
  return `<div class="share-tools"><button type="button" data-copy-community="${escape(c.inviteCode)}">Copy Invite Link</button><a class="primary" href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>`;
}
export function communityCard(c) {
  return `<article class="card community-card"><button class="community-open" data-open-community="${escape(c._id)}" data-code="${escape(c.inviteCode)}" aria-label="Open ${escape(c.name)} community room"></button><p class="eyebrow">${escape(c.domain || "COMMUNITY")}</p><h3>${escape(c.name)}</h3><p>${escape(c.description)}</p>${tags(c.tags)}<p>${c.memberCount} member${c.memberCount === 1 ? "" : "s"}</p><button class="primary" data-join-community="${escape(c.inviteCode)}" ${c.joined ? "disabled" : ""}>${c.joined ? "Joined" : "Join Community"}</button>${shareTools(c)}</article>`;
}

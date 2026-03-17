/* global ACTION_GATE_API_URL */
"use strict";

// ── Configuration ─────────────────────────────────────────────────────────────

const API_BASE =
  (typeof window !== "undefined" && window.ACTION_GATE_API_URL) || window.location.origin;

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  page: 1,
  perPage: 30,
  totalPages: 1,
  statusFilter: "all", // "all" | "active" | "expiring"
  login: null,
};

// ── DOM helpers ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// ── Auth ──────────────────────────────────────────────────────────────────────

const AUTH_KEY = "ag_token";

function getAuthToken() {
  return sessionStorage.getItem(AUTH_KEY);
}
function clearAuthToken() {
  sessionStorage.removeItem(AUTH_KEY);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function expiryStatus(expiresAt, revokedAt) {
  if (revokedAt) return { label: "Revoked", cls: "badge-revoked" };
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  if (exp < now) return { label: "Expired", cls: "badge-expired" };
  if (exp - now < thirtyDays) return { label: "Expiring soon", cls: "badge-expiring" };
  return { label: "Active", cls: "badge-active" };
}

async function apiFetch(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderRow(a) {
  const repo = a.repository
    ? `${escapeHtml(a.repository.owner)}/${escapeHtml(a.repository.name)}`
    : "—";
  const workflowJob = a.jobName
    ? `${escapeHtml(a.workflowPath)}<br/><span class="text-muted mono">job: ${escapeHtml(a.jobName)}</span>`
    : `<span class="mono">${escapeHtml(a.workflowPath)}</span>`;
  const tier =
    a.tier === "ORGANIZATION"
      ? `<span class="badge badge-org">org</span>`
      : `<span class="badge badge-user">user</span>`;
  const affil = escapeHtml(a.voucherOrgAffiliation) || '<span class="text-muted">—</span>';
  const org = a.orgGithubLogin
    ? `<a href="https://github.com/${escapeHtml(a.orgGithubLogin)}" target="_blank" rel="noopener">@${escapeHtml(a.orgGithubLogin)}</a>`
    : '<span class="text-muted">—</span>';
  const notes = a.notes
    ? `<span title="${escapeHtml(a.notes)}">${escapeHtml(a.notes.length > 60 ? a.notes.slice(0, 57) + "\u2026" : a.notes)}</span>`
    : '<span class="text-muted">—</span>';
  const created = formatDate(a.createdAt);
  const expiry = formatDate(a.expiresAt);
  const { label, cls } = expiryStatus(a.expiresAt, a.revokedAt);
  const statusBadge = `<span class="badge ${cls}">${label}</span>`;

  // Show revoke button only for active attestations
  let actionsCell = "";
  if (!a.revokedAt && new Date(a.expiresAt) > new Date()) {
    actionsCell = `<button class="btn btn-danger btn-sm btn-revoke"
      data-id="${escapeHtml(a.id)}"
      data-repo="${repo}"
      data-workflow="${escapeHtml(a.workflowPath)}"
      title="Revoke this attestation">Revoke</button>`;
  }

  return `<tr>
    <td class="mono">${repo}</td>
    <td>${workflowJob}</td>
    <td>${tier}</td>
    <td>${affil}</td>
    <td>${org}</td>
    <td>${notes}</td>
    <td>${created}</td>
    <td>${expiry}</td>
    <td>${statusBadge}</td>
    <td>${actionsCell}</td>
  </tr>`;
}

function renderTable(data) {
  const tbody = $("attestations-body");
  if (!data.attestations || data.attestations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--color-muted);padding:32px;">No attestations found.</td></tr>`;
  } else {
    tbody.innerHTML = data.attestations.map(renderRow).join("");
  }

  state.totalPages = Math.max(1, Math.ceil((data.total ?? 0) / state.perPage));
  $("page-info").textContent = `Page ${state.page} of ${state.totalPages}`;
  $("btn-prev").disabled = state.page <= 1;
  $("btn-next").disabled = state.page >= state.totalPages;

  $("loading").hidden = true;
  $("error-msg").hidden = true;
  $("table-wrapper").hidden = false;
  $("pagination").hidden = state.totalPages <= 1;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadMyAttestations() {
  if (!state.login) return;

  $("loading").hidden = false;
  $("table-wrapper").hidden = true;
  $("pagination").hidden = true;
  $("error-msg").hidden = true;

  const params = new URLSearchParams({
    voucher: state.login,
    page: state.page,
    per_page: state.perPage,
  });

  if (state.statusFilter === "active") {
    params.set("active_only", "true");
  }

  try {
    const data = await apiFetch(`/api/v1/attestations?${params}`);

    // Client-side filter for "expiring" status
    if (state.statusFilter === "expiring") {
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      data.attestations = (data.attestations ?? []).filter((a) => {
        if (a.revokedAt) return false;
        const exp = new Date(a.expiresAt).getTime();
        return exp > now && exp - now < thirtyDays;
      });
      data.total = data.attestations.length;
    }

    renderTable(data);
    updateStats(data);
  } catch (err) {
    $("loading").hidden = true;
    $("error-msg").textContent = `Failed to load attestations: ${err.message}`;
    $("error-msg").hidden = false;
  }
}

function updateStats(data) {
  const all = data.attestations ?? [];
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  let active = 0;
  let expiring = 0;
  let revoked = 0;

  // For the "all" filter, stats reflect the visible page.
  // For a true count we'd need a separate API call, but page-level stats are useful enough.
  all.forEach((a) => {
    if (a.revokedAt) {
      revoked++;
    } else {
      const exp = new Date(a.expiresAt).getTime();
      if (exp > now) {
        active++;
        if (exp - now < thirtyDays) expiring++;
      }
    }
  });

  $("stat-active").querySelector(".stat-value").textContent = active.toLocaleString();
  $("stat-expiring").querySelector(".stat-value").textContent = expiring.toLocaleString();
  $("stat-revoked").querySelector(".stat-value").textContent = revoked.toLocaleString();
  $("stat-total").querySelector(".stat-value").textContent = (data.total ?? 0).toLocaleString();
}

// ── Auth init ─────────────────────────────────────────────────────────────────

async function initAuth() {
  // Pick up token from URL hash (same flow as main dashboard)
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    const token = decodeURIComponent(hash.slice(7));
    sessionStorage.setItem(AUTH_KEY, token);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  const token = getAuthToken();
  if (!token) {
    showLoggedOut();
    return;
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      clearAuthToken();
      showLoggedOut();
      return;
    }
    const user = await res.json();
    showLoggedIn(user);
  } catch {
    showLoggedOut();
  }
}

function showLoggedIn(user) {
  state.login = user.login;
  $("user-info").hidden = false;
  $("user-avatar").src = user.avatar_url ?? "";
  $("user-avatar").alt = `@${escapeHtml(user.login)}`;
  $("user-login").textContent = `@${user.login}`;
  $("login-prompt").hidden = true;
  $("page-header").hidden = false;
  $("my-stats").hidden = false;
  $("table-section").hidden = false;
  $("page-title").textContent = `Attestations by @${user.login}`;
  loadMyAttestations();
}

function showLoggedOut() {
  $("user-info").hidden = true;
  $("login-prompt").hidden = false;
  $("page-header").hidden = true;
  $("my-stats").hidden = true;
  $("table-section").hidden = true;
}

// ── Events ────────────────────────────────────────────────────────────────────

$("btn-logout").addEventListener("click", () => {
  clearAuthToken();
  showLoggedOut();
});

$("filter-status").addEventListener("change", () => {
  state.statusFilter = $("filter-status").value;
  state.page = 1;
  loadMyAttestations();
});

$("btn-prev").addEventListener("click", () => {
  state.page--;
  loadMyAttestations();
});
$("btn-next").addEventListener("click", () => {
  state.page++;
  loadMyAttestations();
});

// ── Revoke modal ──────────────────────────────────────────────────────────────

let pendingRevokeId = null;

function openRevokeModal(id, repo, workflow) {
  pendingRevokeId = id;
  $("revoke-modal-desc").textContent =
    `Revoke the attestation for ${workflow} in ${repo}? This cannot be undone.`;
  $("revoke-modal-error").hidden = true;
  $("revoke-confirm").disabled = false;
  $("revoke-confirm").textContent = "Revoke";
  $("revoke-modal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeRevokeModal() {
  $("revoke-modal").hidden = true;
  document.body.style.overflow = "";
  pendingRevokeId = null;
}

$("revoke-modal-close").addEventListener("click", closeRevokeModal);
$("revoke-cancel").addEventListener("click", closeRevokeModal);
$("revoke-modal").addEventListener("click", (e) => {
  if (e.target === $("revoke-modal")) closeRevokeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("revoke-modal").hidden) closeRevokeModal();
});

$("revoke-confirm").addEventListener("click", async () => {
  if (!pendingRevokeId) return;
  const token = getAuthToken();
  if (!token) {
    $("revoke-modal-error").textContent = "You must be logged in to revoke attestations.";
    $("revoke-modal-error").hidden = false;
    return;
  }

  $("revoke-confirm").disabled = true;
  $("revoke-confirm").textContent = "Revoking\u2026";
  $("revoke-modal-error").hidden = true;

  try {
    const res = await fetch(`${API_BASE}/api/v1/attestations/${encodeURIComponent(pendingRevokeId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        clearAuthToken();
        showLoggedOut();
        closeRevokeModal();
        return;
      }
      $("revoke-modal-error").textContent = data.error || `HTTP ${res.status}`;
      $("revoke-modal-error").hidden = false;
      $("revoke-confirm").disabled = false;
      $("revoke-confirm").textContent = "Revoke";
      return;
    }

    closeRevokeModal();
    loadMyAttestations();
  } catch (err) {
    $("revoke-modal-error").textContent = `Request failed: ${err.message}`;
    $("revoke-modal-error").hidden = false;
    $("revoke-confirm").disabled = false;
    $("revoke-confirm").textContent = "Revoke";
  }
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-revoke");
  if (!btn) return;
  openRevokeModal(btn.dataset.id, btn.dataset.repo, btn.dataset.workflow);
});

// ── Deploy SHA ────────────────────────────────────────────────────────────────

(function initDeploySha() {
  const el = $("deploy-sha");
  if (!el) return;
  const sha = el.textContent.trim();
  if (!sha || sha === "__GIT_SHA__") {
    el.hidden = true;
    return;
  }
  const link = document.createElement("a");
  link.href = `https://github.com/jordanconway/github-action-gate/commit/${encodeURIComponent(sha)}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = sha;
  link.className = "deploy-sha";
  el.replaceWith(link);
})();

// ── Init ──────────────────────────────────────────────────────────────────────

initAuth();

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../js/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: "tabique-admin-auth" }
});
const TEAM_NAMES = ["チームA", "チームB", "チームC", "チームD", "チームE", "チームF"];

const elements = {
  login: document.querySelector("#admin-login"),
  loginForm: document.querySelector("#admin-login-form"),
  email: document.querySelector("#admin-email"),
  password: document.querySelector("#admin-password"),
  loginError: document.querySelector("#login-error"),
  loginSubmit: document.querySelector("#login-submit"),
  app: document.querySelector("#admin-app"),
  adminName: document.querySelector("#admin-name"),
  message: document.querySelector("#admin-message"),
  viewTitle: document.querySelector("#view-title"),
  issueForm: document.querySelector("#issue-teams-form"),
  issueButton: document.querySelector("#issue-teams"),
  pin: document.querySelector("#team-pin"),
  expires: document.querySelector("#team-expires"),
  limit: document.querySelector("#team-limit"),
  issuedQr: document.querySelector("#issued-qr"),
  qrGrid: document.querySelector("#qr-grid"),
  teamsBody: document.querySelector("#teams-body"),
  participantsBody: document.querySelector("#participants-body"),
  participantCount: document.querySelector("#participant-count"),
  reportsGrid: document.querySelector("#reports-grid"),
  reportCount: document.querySelector("#report-count")
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function setMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.className = isError ? "message error" : "message";
  elements.message.hidden = !message;
}

function showLogin(message = "") {
  document.body.classList.remove("admin-pending");
  elements.app.hidden = true;
  elements.login.hidden = false;
  elements.loginError.textContent = message;
  elements.loginError.hidden = !message;
}

async function activateAdmin(session) {
  const [{ data: isAdmin, error: adminError }, { data: profile }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.from("admins").select("display_name").eq("user_id", session.user.id).single()
  ]);
  if (adminError || !isAdmin) {
    await supabase.auth.signOut();
    throw new Error("このアカウントには管理者権限がありません。");
  }
  elements.adminName.textContent = profile?.display_name || session.user.email;
  elements.login.hidden = true;
  elements.app.hidden = false;
  document.body.classList.remove("admin-pending");
  await loadAll();
}

async function loadAll() {
  setMessage("最新情報を読み込んでいます。");
  const [teamsResult, participantsResult, reportsResult] = await Promise.all([
    supabase.rpc("admin_list_team_access"),
    supabase.rpc("admin_list_participants"),
    supabase.from("photos").select("id, team_name, caption, storage_path, thumbnail_path, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(200)
  ]);
  const error = teamsResult.error || participantsResult.error || reportsResult.error;
  if (error) {
    setMessage(`情報を読み込めませんでした: ${error.message}`, true);
    return;
  }
  renderTeams(teamsResult.data);
  renderParticipants(participantsResult.data);
  await renderReports(reportsResult.data);
  setMessage("");
}

function renderTeams(teams) {
  elements.teamsBody.replaceChildren();
  if (!teams.length) {
    elements.teamsBody.innerHTML = '<tr><td class="empty" colspan="5">発行済みのチームはありません。</td></tr>';
    return;
  }
  teams.forEach((team) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(team.team_name)}</strong></td>
      <td>${team.registration_count} / ${team.max_registrations}</td>
      <td>${formatDate(team.expires_at)}</td>
      <td><span class="status${team.is_active ? "" : " off"}">${team.is_active ? "有効" : "停止中"}</span></td>
      <td><button class="text-button" type="button">${team.is_active ? "停止" : "再開"}</button></td>`;
    row.querySelector("button").addEventListener("click", () => toggleTeam(team));
    elements.teamsBody.append(row);
  });
}

function renderParticipants(participants) {
  elements.participantsBody.replaceChildren();
  elements.participantCount.textContent = `${participants.length}台`;
  if (!participants.length) {
    elements.participantsBody.innerHTML = '<tr><td class="empty" colspan="5">参加登録された端末はありません。</td></tr>';
    return;
  }
  participants.forEach((participant) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(participant.display_name)}</strong></td>
      <td>${escapeHtml(participant.team_name)}</td>
      <td>${formatDate(participant.created_at)}</td>
      <td><span class="status${participant.is_active ? "" : " off"}">${participant.is_active ? "有効" : "停止中"}</span></td>
      <td><button class="text-button" type="button">${participant.is_active ? "停止" : "再開"}</button></td>`;
    row.querySelector("button").addEventListener("click", () => toggleParticipant(participant));
    elements.participantsBody.append(row);
  });
}

async function renderReports(reports) {
  elements.reportsGrid.replaceChildren();
  elements.reportCount.textContent = `${reports.length}件`;
  if (!reports.length) {
    elements.reportsGrid.innerHTML = '<p class="empty">達成レポートはありません。</p>';
    return;
  }
  const paths = [...new Set(reports.map((report) => report.thumbnail_path || report.storage_path).filter(Boolean))];
  const { data: signedFiles } = await supabase.storage.from("photos").createSignedUrls(paths, 15 * 60);
  const urls = new Map((signedFiles || []).map((file) => [file.path, file.signedUrl]));
  reports.forEach((report) => {
    const item = document.createElement("article");
    item.className = "report-item";
    const path = report.thumbnail_path || report.storage_path;
    item.innerHTML = `
      <img src="${escapeHtml(urls.get(path) || "")}" alt="">
      <div class="report-copy">
        <strong>${escapeHtml(report.caption || "ミッション達成！")}</strong>
        <p class="report-meta">${escapeHtml(report.team_name)} ・ ${formatDate(report.created_at)}</p>
        <button class="text-button" type="button">削除する</button>
      </div>`;
    item.querySelector("button").addEventListener("click", () => deleteReport(report));
    elements.reportsGrid.append(item);
  });
}

async function toggleTeam(team) {
  const action = team.is_active ? "停止" : "再開";
  if (!confirm(`${team.team_name}のQR受付を${action}しますか？`)) return;
  const { error } = await supabase.rpc("admin_set_team_access_active", { p_id: team.id, p_is_active: !team.is_active });
  if (error) setMessage(error.message, true);
  else await loadAll();
}

async function toggleParticipant(participant) {
  const action = participant.is_active ? "停止" : "再開";
  if (!confirm(`${participant.display_name}の端末を${action}しますか？`)) return;
  const { error } = await supabase.rpc("admin_set_participant_active", { p_user_id: participant.user_id, p_is_active: !participant.is_active });
  if (error) setMessage(error.message, true);
  else await loadAll();
}

async function deleteReport(report) {
  if (!confirm("この達成レポートを削除しますか？この操作は取り消せません。")) return;
  const { error: hideError } = await supabase.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", report.id);
  if (hideError) {
    setMessage(hideError.message, true);
    return;
  }
  const paths = [report.storage_path, report.thumbnail_path].filter(Boolean);
  await supabase.storage.from("photos").remove(paths);
  await supabase.from("photos").delete().eq("id", report.id);
  await loadAll();
}

function getParticipantBaseUrl() {
  const url = new URL("../", window.location.href);
  url.hash = "";
  url.search = "";
  return url.href;
}

async function renderIssuedQr(issuedTeams) {
  elements.qrGrid.replaceChildren();
  for (const team of issuedTeams) {
    const participantUrl = `${getParticipantBaseUrl()}#team=${team.token}`;
    const dataUrl = await QRCode.toDataURL(participantUrl, { width: 360, margin: 2, color: { dark: "#173f3a", light: "#ffffff" } });
    const item = document.createElement("article");
    item.className = "qr-item";
    item.innerHTML = `
      <img src="${dataUrl}" alt="${escapeHtml(team.name)}参加用QRコード">
      <div>
        <h4>${escapeHtml(team.name)}</h4>
        <p class="qr-url">${escapeHtml(participantUrl)}</p>
        <div class="qr-actions">
          <a href="${dataUrl}" download="tabique-${team.name}.png">QRを保存</a>
          <button type="button">URLをコピー</button>
        </div>
      </div>`;
    item.querySelector("button").addEventListener("click", async () => {
      await navigator.clipboard.writeText(participantUrl);
      setMessage(`${team.name}の参加URLをコピーしました。`);
    });
    elements.qrGrid.append(item);
  }
  elements.issuedQr.hidden = false;
}

async function issueSixTeams(event) {
  event.preventDefault();
  elements.issueButton.disabled = true;
  setMessage("6チームのQRコードを発行しています。");
  const issued = [];
  try {
    for (const name of TEAM_NAMES) {
      const { data, error } = await supabase.rpc("admin_create_team_access", {
        p_team_name: name,
        p_pin: elements.pin.value,
        p_expires_at: new Date(elements.expires.value).toISOString(),
        p_max_registrations: Number(elements.limit.value)
      });
      if (error) throw new Error(`${name}: ${error.message}`);
      issued.push({ name, token: data });
    }
    await renderIssuedQr(issued);
    elements.pin.value = "";
    await loadAll();
    setMessage("6チームを発行しました。QR画像を保存してください。");
  } catch (error) {
    if (issued.length) await renderIssuedQr(issued);
    setMessage(`途中で発行を停止しました。発行済みQRを保存してください。${error.message}`, true);
  } finally {
    elements.issueButton.disabled = false;
  }
}

function switchView(name) {
  const titles = { teams: "チーム管理", participants: "参加端末", reports: "達成レポート" };
  document.querySelectorAll(".view").forEach((view) => { view.hidden = view.id !== `${name}-view`; });
  document.querySelectorAll(".nav-button").forEach((button) => { button.classList.toggle("is-active", button.dataset.view === name); });
  elements.viewTitle.textContent = titles[name];
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginSubmit.disabled = true;
  elements.loginError.hidden = true;
  const { data, error } = await supabase.auth.signInWithPassword({ email: elements.email.value.trim(), password: elements.password.value });
  try {
    if (error) throw new Error("メールアドレスまたはパスワードが正しくありません。");
    await activateAdmin(data.session);
    elements.loginForm.reset();
  } catch (loginError) {
    showLogin(loginError.message);
  } finally {
    elements.loginSubmit.disabled = false;
  }
});

elements.issueForm.addEventListener("submit", issueSixTeams);
document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelector("#refresh").addEventListener("click", loadAll);
document.querySelector("#sign-out").addEventListener("click", async () => { await supabase.auth.signOut(); showLogin(); });

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
elements.expires.value = tomorrow.toISOString().slice(0, 16);

const { data: sessionData } = await supabase.auth.getSession();
if (sessionData.session) {
  try {
    await activateAdmin(sessionData.session);
  } catch (error) {
    showLogin(error.message);
  }
} else {
  showLogin();
}

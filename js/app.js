import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1920;
const THUMBNAIL_EDGE = 720;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const isConfigured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const teamToken = new URLSearchParams(window.location.hash.slice(1)).get("team")?.trim() || "";

const elements = {
  loginForm: document.querySelector("#login-form"),
  loginCopy: document.querySelector("#login-copy"),
  displayName: document.querySelector("#display-name"),
  eventPin: document.querySelector("#event-pin"),
  loginMessage: document.querySelector("#login-message"),
  loginButton: document.querySelector("#login-button"),
  participantName: document.querySelector("#participant-name"),
  gallery: document.querySelector("#gallery"),
  status: document.querySelector("#status"),
  emptyState: document.querySelector("#empty-state"),
  photoCount: document.querySelector("#photo-count"),
  uploadDialog: document.querySelector("#upload-dialog"),
  photoDialog: document.querySelector("#photo-dialog"),
  photoDetail: document.querySelector("#photo-detail"),
  uploadForm: document.querySelector("#upload-form"),
  fileInput: document.querySelector("#photo-file"),
  imagePreview: document.querySelector("#image-preview"),
  dropPlaceholder: document.querySelector("#drop-placeholder"),
  dropZone: document.querySelector("#drop-zone"),
  caption: document.querySelector("#caption"),
  captionCount: document.querySelector("#caption-count"),
  takenAt: document.querySelector("#taken-at"),
  formMessage: document.querySelector("#form-message"),
  submitButton: document.querySelector("#submit-button"),
  cardTemplate: document.querySelector("#photo-card-template")
};

let currentUser = null;
let currentParticipant = null;
let previewUrl = null;

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function setStatus(message, type = "loading") {
  elements.status.hidden = false;
  elements.status.className = type === "note" ? "status is-note" : "status";
  elements.status.replaceChildren();
  if (type === "loading") {
    const loader = document.createElement("span");
    loader.className = "loader";
    loader.setAttribute("aria-hidden", "true");
    elements.status.append(loader);
  }
  elements.status.append(document.createTextNode(message));
}

function hideStatus() {
  elements.status.hidden = true;
}

function createMeta(photo) {
  const fragment = document.createDocumentFragment();
  if (photo.taken_at) {
    const date = document.createElement("span");
    date.textContent = formatDate(photo.taken_at);
    fragment.append(date);
  }
  if (photo.location) {
    const location = document.createElement("span");
    location.textContent = photo.location;
    fragment.append(location);
  }
  return fragment;
}

function renderPhotos(photos) {
  elements.gallery.replaceChildren();
  elements.emptyState.hidden = photos.length > 0;
  elements.photoCount.textContent = `${photos.length} PHOTOS`;

  photos.forEach((photo, index) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector(".photo-card-image");
    const openButton = card.querySelector(".photo-card-open");
    image.src = photo.thumbnailUrl;
    image.alt = photo.caption || "投稿された写真";
    card.querySelector(".photo-card-caption").textContent = photo.caption || "言葉のない一枚";
    card.querySelector(".photo-card-meta").append(createMeta(photo));
    card.style.animationDelay = `${Math.min(index * 70, 350)}ms`;
    openButton.setAttribute("aria-label", `${image.alt}を拡大表示`);
    image.addEventListener("error", () => {
      if (image.src !== photo.publicUrl) {
        image.src = photo.publicUrl;
        return;
      }
      image.removeAttribute("src");
      image.alt = "画像を表示できません";
      image.classList.add("is-unavailable");
      openButton.disabled = true;
      openButton.dataset.unavailable = "画像を表示できません";
    });
    openButton.addEventListener("click", () => openPhoto(photo));
    elements.gallery.append(card);
  });

  hideStatus();
}

function openPhoto(photo) {
  const image = document.createElement("img");
  image.className = "photo-detail-image";
  image.src = photo.publicUrl;
  image.alt = photo.caption || "投稿された写真";

  const copy = document.createElement("div");
  copy.className = "photo-detail-copy";
  const caption = document.createElement("h3");
  caption.textContent = photo.caption || "言葉のない一枚";
  copy.append(caption);

  if (photo.taken_at) {
    const date = document.createElement("p");
    date.textContent = formatDate(photo.taken_at);
    copy.append(date);
  }
  if (photo.location) {
    const location = document.createElement("p");
    location.textContent = photo.location;
    copy.append(location);
  }

  if (currentParticipant?.team_name === photo.team_name) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "この写真を削除";
    deleteButton.addEventListener("click", () => deletePhoto(photo, deleteButton));
    copy.append(deleteButton);
  }

  elements.photoDetail.replaceChildren(image, copy);
  elements.photoDialog.showModal();
}

function showLogin(message = "") {
  document.body.classList.remove("auth-pending", "is-authenticated");
  document.body.classList.add("is-auth-required");
  const needsQr = !teamToken;
  elements.loginCopy.textContent = needsQr
    ? "チームのQRコードからこのページを開いてください。"
    : "表示名と旅行案内に記載されたイベントPINを入力してください。";
  elements.displayName.disabled = needsQr;
  elements.eventPin.disabled = needsQr;
  elements.loginButton.disabled = needsQr;
  const displayMessage = message || (needsQr ? "参加登録にはチームのQRコードが必要です。" : "");
  elements.loginMessage.hidden = !displayMessage;
  elements.loginMessage.textContent = displayMessage;
}

async function activateSession(session) {
  currentUser = session.user;
  const { data, error } = await supabase
    .from("participants")
    .select("display_name, team_name")
    .eq("user_id", currentUser.id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    if (!teamToken) await supabase.auth.signOut();
    currentUser = null;
    throw new Error("この端末は旅行参加者として登録されていません。");
  }

  currentParticipant = data;
  elements.participantName.textContent = data.team_name
    ? `${data.display_name} / ${data.team_name}`
    : data.display_name;
  document.body.classList.remove("auth-pending", "is-auth-required");
  document.body.classList.add("is-authenticated");
  await loadPhotos();
}

async function loadPhotos() {
  setStatus("写真を読み込んでいます");
  const { data, error } = await supabase
    .from("photos")
    .select("id, user_id, team_name, storage_path, thumbnail_path, caption, location, taken_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    setStatus(`写真を読み込めませんでした: ${error.message}`, "note");
    elements.photoCount.textContent = "ERROR";
    return;
  }

  if (data.length === 0) {
    renderPhotos([]);
    return;
  }

  const paths = [...new Set(data.flatMap((photo) => [photo.storage_path, photo.thumbnail_path].filter(Boolean)))];
  const { data: signedFiles, error: signedUrlError } = await supabase.storage
    .from("photos")
    .createSignedUrls(paths, 15 * 60);
  if (signedUrlError) {
    setStatus("写真の表示URLを作成できませんでした。再読み込みしてください。", "note");
    return;
  }

  const signedUrls = new Map(signedFiles.map((file) => [file.path, file.signedUrl]));
  const photos = data.map((photo) => ({
    ...photo,
    publicUrl: signedUrls.get(photo.storage_path),
    thumbnailUrl: signedUrls.get(photo.thumbnail_path) || signedUrls.get(photo.storage_path)
  }));
  renderPhotos(photos);
}

function showFormMessage(message) {
  elements.formMessage.textContent = message;
  elements.formMessage.hidden = false;
}

function setSubmitting(isSubmitting) {
  elements.uploadForm.classList.toggle("is-submitting", isSubmitting);
  elements.submitButton.disabled = isSubmitting;
  elements.fileInput.disabled = isSubmitting;
}

function validateFile(file) {
  if (!file) return "投稿する写真を選択してください。";
  if (!ALLOWED_TYPES.has(file.type)) return "JPEG、PNG、WebP形式の写真を選択してください。";
  if (file.size > MAX_FILE_SIZE) return "写真のサイズは10MB以下にしてください。";
  return "";
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("画像を変換できませんでした。")),
      "image/webp",
      quality
    );
  });
}

async function renderImage(bitmap, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, quality);
}

async function optimizeImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("画像を読み込めませんでした。別の画像を選択してください。");
  }

  try {
    const [image, thumbnail] = await Promise.all([
      renderImage(bitmap, MAX_IMAGE_EDGE, 0.82),
      renderImage(bitmap, THUMBNAIL_EDGE, 0.76)
    ]);
    if (image.size > MAX_FILE_SIZE) throw new Error("圧縮後の画像サイズが10MBを超えています。");
    return { image, thumbnail };
  } finally {
    bitmap.close();
  }
}

function updatePreview(file) {
  const validationMessage = validateFile(file);
  if (validationMessage) {
    showFormMessage(validationMessage);
    elements.fileInput.value = "";
    return;
  }

  elements.formMessage.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  elements.imagePreview.src = previewUrl;
  elements.imagePreview.hidden = false;
  elements.dropPlaceholder.hidden = true;
}

function resetForm() {
  elements.uploadForm.reset();
  elements.formMessage.hidden = true;
  elements.imagePreview.hidden = true;
  elements.dropPlaceholder.hidden = false;
  elements.captionCount.textContent = "0 / 160";
  elements.takenAt.value = new Date().toISOString().slice(0, 10);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

async function handleUpload(event) {
  event.preventDefault();
  elements.formMessage.hidden = true;

  if (!isConfigured) {
    showFormMessage("先にjs/config.jsへSupabaseのURLとanon keyを設定してください。");
    return;
  }

  const file = elements.fileInput.files[0];
  const validationMessage = validateFile(file);
  if (validationMessage) {
    showFormMessage(validationMessage);
    return;
  }

  setSubmitting(true);
  let storagePath = "";
  try {
    const optimized = await optimizeImage(file);
    const imageId = crypto.randomUUID();
    storagePath = `${currentUser.id}/${imageId}.webp`;
    const thumbnailPath = `${currentUser.id}/${imageId}-thumb.webp`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, optimized.image, { contentType: "image/webp", upsert: false });
    if (uploadError) throw uploadError;

    const { error: thumbnailError } = await supabase.storage
      .from("photos")
      .upload(thumbnailPath, optimized.thumbnail, { contentType: "image/webp", upsert: false });
    if (thumbnailError) {
      await supabase.storage.from("photos").remove([storagePath]);
      throw thumbnailError;
    }

    const formData = new FormData(elements.uploadForm);
    const { error: insertError } = await supabase.from("photos").insert({
      user_id: currentUser.id,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      original_name: file.name.slice(0, 255),
      caption: formData.get("caption")?.trim() || null,
      location: formData.get("location")?.trim() || null,
      taken_at: formData.get("taken_at") || null
    });
    if (insertError) {
      await supabase.storage.from("photos").remove([storagePath, thumbnailPath]);
      throw insertError;
    }

    elements.uploadDialog.close();
    resetForm();
    await loadPhotos();
  } catch (error) {
    showFormMessage(error.message || "投稿に失敗しました。時間をおいて再度お試しください。");
  } finally {
    setSubmitting(false);
  }
}

async function deletePhoto(photo, button) {
  if (!window.confirm("この写真を削除しますか？この操作は取り消せません。")) return;
  button.disabled = true;
  button.textContent = "削除しています";

  const { error: hideError } = await supabase
    .from("photos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", photo.id);
  if (hideError) {
    button.disabled = false;
    button.textContent = "削除できませんでした。もう一度試す";
    return;
  }

  const paths = [photo.storage_path, photo.thumbnail_path].filter(Boolean);
  const { error: storageError } = await supabase.storage.from("photos").remove(paths);
  if (storageError) {
    elements.photoDialog.close();
    await loadPhotos();
    setStatus("写真は一覧から削除しました。ファイルの完全削除は管理者が後で処理します。", "note");
    return;
  }

  const { error: databaseError } = await supabase.from("photos").delete().eq("id", photo.id);
  if (databaseError) {
    button.disabled = false;
    button.textContent = "記録の削除に失敗しました";
    return;
  }

  elements.photoDialog.close();
  await loadPhotos();
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!teamToken) {
      showLogin();
      return;
    }
    elements.loginButton.disabled = true;
    elements.loginMessage.hidden = true;
    try {
      let { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw new Error("参加登録を開始できませんでした。しばらくしてから再度お試しください。");
        sessionData = data;
      }

      const { data: claimResult, error: claimError } = await supabase.rpc("claim_team_access", {
        p_team_token: teamToken,
        p_pin: elements.eventPin.value,
        p_display_name: elements.displayName.value.trim()
      });
      if (claimError) {
        await supabase.auth.signOut();
        throw new Error("参加登録に失敗しました。しばらくしてから再度お試しください。");
      }
      if (claimResult !== "ok") {
        const messages = {
          invalid_display_name: "表示名を入力してください。",
          rate_limited: "PINの入力回数が上限に達しました。10分後に再度お試しください。",
          already_registered: "この端末はすでに参加登録されています。"
        };
        throw new Error(messages[claimResult] || "QRコードまたはPINが正しくないか、有効期限が切れています。");
      }

      await activateSession(sessionData.session);
      window.history.replaceState({}, "", window.location.pathname);
      elements.loginForm.reset();
    } catch (loginError) {
      showLogin(loginError.message);
    } finally {
      elements.loginButton.disabled = false;
    }
  });
  document.querySelector("[data-sign-out]").addEventListener("click", async () => {
    if (!window.confirm("この端末の参加登録を解除しますか？再参加にはチームのQRコードとPINが必要です。")) return;
    await supabase.auth.signOut();
    window.location.replace(window.location.pathname);
  });
  document.querySelectorAll("[data-open-upload]").forEach((button) => {
    button.addEventListener("click", () => elements.uploadDialog.showModal());
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => elements.uploadDialog.close());
  });
  document.querySelector("[data-close-photo]").addEventListener("click", () => elements.photoDialog.close());

  elements.uploadDialog.addEventListener("click", (event) => {
    if (event.target === elements.uploadDialog) elements.uploadDialog.close();
  });
  elements.photoDialog.addEventListener("click", (event) => {
    if (event.target === elements.photoDialog) elements.photoDialog.close();
  });
  elements.uploadForm.addEventListener("submit", handleUpload);
  elements.fileInput.addEventListener("change", () => updatePreview(elements.fileInput.files[0]));
  elements.caption.addEventListener("input", () => {
    elements.captionCount.textContent = `${elements.caption.value.length} / 160`;
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  });
  elements.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    elements.fileInput.files = transfer.files;
    updatePreview(file);
  });
}

async function initialize() {
  resetForm();

  if (!isConfigured) {
    showLogin("Supabaseの接続設定がありません。管理者へ連絡してください。");
    return;
  }

  bindEvents();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      document.body.classList.remove("auth-pending");
      showLogin();
      return;
    }
    await activateSession(data.session);
  } catch (error) {
    showLogin(teamToken ? "" : (error.message || "参加状態を確認できませんでした。"));
  }
}

initialize();
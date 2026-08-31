import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const isConfigured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const demoPhotos = [
  {
    id: "demo-1",
    caption: "午後の光がきれいだった日",
    location: "窓辺",
    taken_at: "2026-08-30",
    created_at: "2026-08-30T08:00:00Z",
    publicUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85",
    isDemo: true
  },
  {
    id: "demo-2",
    caption: "静かな朝の散歩",
    location: "海岸通り",
    taken_at: "2026-08-28",
    created_at: "2026-08-28T08:00:00Z",
    publicUrl: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1000&q=85",
    isDemo: true
  },
  {
    id: "demo-3",
    caption: "帰り道で見つけた色",
    location: "街角",
    taken_at: "2026-08-24",
    created_at: "2026-08-24T08:00:00Z",
    publicUrl: "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1000&q=85",
    isDemo: true
  },
  {
    id: "demo-4",
    caption: "雨上がり",
    location: "公園",
    taken_at: "2026-08-20",
    created_at: "2026-08-20T08:00:00Z",
    publicUrl: "https://images.unsplash.com/photo-1501691223387-dd0500403074?auto=format&fit=crop&w=1200&q=85",
    isDemo: true
  },
  {
    id: "demo-5",
    caption: "ゆっくり流れる時間",
    location: "喫茶店",
    taken_at: "2026-08-18",
    created_at: "2026-08-18T08:00:00Z",
    publicUrl: "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1000&q=85",
    isDemo: true
  }
];

const elements = {
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

function renderPhotos(photos, showDemoNotice = false) {
  elements.gallery.replaceChildren();
  elements.emptyState.hidden = photos.length > 0;
  elements.photoCount.textContent = `${photos.length} PHOTOS`;

  photos.forEach((photo, index) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const image = card.querySelector(".photo-card-image");
    const openButton = card.querySelector(".photo-card-open");
    image.src = photo.publicUrl;
    image.alt = photo.caption || "投稿された写真";
    card.querySelector(".photo-card-caption").textContent = photo.caption || "言葉のない一枚";
    card.querySelector(".photo-card-meta").append(createMeta(photo));
    card.style.animationDelay = `${Math.min(index * 70, 350)}ms`;
    openButton.setAttribute("aria-label", `${image.alt}を拡大表示`);
    openButton.addEventListener("click", () => openPhoto(photo));
    elements.gallery.append(card);
  });

  if (showDemoNotice) {
    setStatus("現在はデモ表示です。Supabaseを設定すると写真を投稿できます。", "note");
  } else {
    hideStatus();
  }
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

  if (!photo.isDemo && currentUser?.id === photo.user_id) {
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

async function ensureUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) {
    currentUser = sessionData.session.user;
    return;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error("匿名認証に失敗しました。SupabaseでAnonymous Sign-Insを有効にしてください。");
  currentUser = data.user;
}

async function loadPhotos() {
  setStatus("写真を読み込んでいます");
  const { data, error } = await supabase
    .from("photos")
    .select("id, user_id, storage_path, caption, location, taken_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    setStatus(`写真を読み込めませんでした: ${error.message}`, "note");
    elements.photoCount.textContent = "ERROR";
    return;
  }

  const photos = data.map((photo) => ({
    ...photo,
    publicUrl: supabase.storage.from("photos").getPublicUrl(photo.storage_path).data.publicUrl
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
    await ensureUser();
    const extension = file.name.split(".").pop().toLowerCase();
    storagePath = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const formData = new FormData(elements.uploadForm);
    const { error: insertError } = await supabase.from("photos").insert({
      user_id: currentUser.id,
      storage_path: storagePath,
      original_name: file.name.slice(0, 255),
      caption: formData.get("caption")?.trim() || null,
      location: formData.get("location")?.trim() || null,
      taken_at: formData.get("taken_at") || null
    });
    if (insertError) {
      await supabase.storage.from("photos").remove([storagePath]);
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

  const { error: storageError } = await supabase.storage.from("photos").remove([photo.storage_path]);
  if (storageError) {
    button.disabled = false;
    button.textContent = "削除できませんでした。もう一度試す";
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
  bindEvents();
  resetForm();

  if (!isConfigured) {
    renderPhotos(demoPhotos, true);
    return;
  }

  try {
    await ensureUser();
    await loadPhotos();
  } catch (error) {
    setStatus(error.message, "note");
    elements.photoCount.textContent = "SETUP REQUIRED";
  }
}

initialize();
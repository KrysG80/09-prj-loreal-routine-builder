/* ===== DOM references ===== */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const productModal = document.getElementById("productModal");
const modalClose = document.getElementById("modalClose");
const modalImg = document.getElementById("modalImg");
const modalTitle = document.getElementById("modalTitle");
const modalBrand = document.getElementById("modalBrand");
const modalCategory = document.getElementById("modalCategory");
const modalDesc = document.getElementById("modalDesc");

/* New controls */
const keywordSearch = document.getElementById("keywordSearch");
const rtlSwitch = document.getElementById("rtlSwitch");

/* ===== App state ===== */
let allProducts = [];
let selectedIds = new Set(JSON.parse(localStorage.getItem("selectedProductIds") || "[]"));
let chatHistory = JSON.parse(sessionStorage.getItem("chatHistory") || "[]");

/* ===== Helpers ===== */
function saveSelections() {
  localStorage.setItem("selectedProductIds", JSON.stringify([...selectedIds]));
}
function persistChat() {
  sessionStorage.setItem("chatHistory", JSON.stringify(chatHistory));
}
function scrollChatToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function msg(role, text) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = `<span class="role">${role === "user" ? "You" : "AI"}</span><div class="bubble">${text}</div>`;
  chatWindow.appendChild(el);
  scrollChatToBottom();
}
function productById(id) {
  return allProducts.find(p => String(p.id) === String(id));
}

/* ===== Initial placeholder ===== */
productsContainer.innerHTML = `<div class="placeholder-message">Select a category or search to view products</div>`;

/* ===== Load products from JSON ===== */
async function loadProducts() {
  const res = await fetch("products.json");
  const data = await res.json();
  return data.products;
}

/* ===== Filtering (category + keyword) ===== */
function getActiveFilters() {
  const cat = categoryFilter?.value || "";
  const q = (keywordSearch?.value || "").trim().toLowerCase();
  return { cat, q };
}

function applyFilters() {
  const { cat, q } = getActiveFilters();
  let list = [...allProducts];
  if (cat) list = list.filter(p => p.category === cat);
  if (q) {
    list = list.filter(p => {
      const hay = `${p.name} ${p.brand} ${p.category} ${p.description}`.toLowerCase();
      return hay.includes(q);
    });
  }
  renderProducts(list);
}

/* ===== Renderers ===== */
function renderProducts(products) {
  if (!products.length) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products found.</div>`;
    return;
  }

  productsContainer.innerHTML = products.map(p => {
    const selected = selectedIds.has(p.id) ? "selected" : "";
    return `
      <article class="product-card ${selected}" data-id="${p.id}" tabindex="0" aria-label="${p.name} by ${p.brand}">
        <img src="${p.image}" alt="${p.name} product image" />
        <div class="product-info">
          <h3>${p.name}</h3>
          <p>${p.brand}</p>
          <div class="card-actions">
            <button class="btn btn-info js-details" data-id="${p.id}" aria-label="View ${p.name} details"><i class="fa-regular fa-circle-question"></i> Details</button>
            <button class="btn btn-select js-toggle" data-id="${p.id}" aria-label="${selected ? "Unselect" : "Select"} ${p.name}">${selected ? "Unselect" : "Select"}</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  productsContainer.querySelectorAll(".js-toggle").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.currentTarget.dataset.id);
      toggleSelect(id);
    });
  });

  productsContainer.querySelectorAll(".js-details").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.currentTarget.dataset.id);
      showDetails(id);
    });
  });
}

function renderSelectedChips() {
  const chips = [...selectedIds].map(id => {
    const p = productById(id);
    if (!p) return "";
    return `
      <span class="chip" data-id="${id}">
        <strong>${p.brand}</strong>&nbsp;${p.name}
        <button class="chip-remove" aria-label="Remove ${p.name}" data-id="${id}"><i class="fa-solid fa-xmark"></i></button>
      </span>
    `;
  }).join("");
  selectedProductsList.innerHTML = chips || `<p class="muted">No products selected yet.</p>`;

  selectedProductsList.querySelectorAll(".chip-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.currentTarget.dataset.id);
      selectedIds.delete(id);
      saveSelections();
      applyFilters();
      renderSelectedChips();
    });
  });
}

/* ===== Toggle selection ===== */
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  saveSelections();
  applyFilters();
  renderSelectedChips();
}

/* ===== Show details (modal) ===== */
function showDetails(id) {
  const p = productById(id);
  if (!p) return;
  modalImg.src = p.image;
  modalImg.alt = p.name;
  modalTitle.textContent = p.name;
  modalBrand.textContent = p.brand;
  modalCategory.textContent = p.category;
  modalDesc.textContent = p.description;
  productModal.showModal();
}

modalClose?.addEventListener("click", () => productModal.close());
productModal?.addEventListener("click", (e) => {
  const card = productModal.querySelector(".modal__card");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    productModal.close();
  }
});

/* ===== Events: filters ===== */
categoryFilter.addEventListener("change", applyFilters);
keywordSearch.addEventListener("input", applyFilters);

/* ===== Clear selections ===== */
clearSelectionsBtn.addEventListener("click", () => {
  selectedIds.clear();
  saveSelections();
  renderSelectedChips();
  applyFilters();
});

/* ===== Worker call (OpenAI proxy) ===== */
async function callWorker(messages, opts = {}) {
  const body = {
    messages,
    temperature: 0.7,
    system: `You are a professional L’Oréal beauty advisor. Build routines only from the provided product JSON. Tailor by skin/hair type, concerns, and time of day. Keep advice safe and general; avoid medical claims. If asked about topics outside skincare, haircare, makeup, fragrance, or the generated routine, gently steer back.`,
    enableWebSearch: Boolean(window.ENABLE_WEB_SEARCH),
    ...opts
  };

  try {
    const res = await fetch(window.WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Worker returned ${res.status}`);

    const data = await res.json();
    return data.reply || "No reply from AI.";
  } catch (err) {
    console.error("Worker call failed:", err);
    throw err; // UI handled by the caller
  }
}

function selectedProductsData() {
  return [...selectedIds].map(id => productById(id)).filter(Boolean);
}

/* ===== Generate Routine ===== */
generateBtn.addEventListener("click", async () => {
  const picked = selectedProductsData();
  if (!picked.length) {
    msg("assistant", "Please select at least one product to build your routine.");
    return;
  }

  const userPrompt = `Create a concise, step-by-step routine using ONLY these selected products (JSON included). Assume normal use instructions. Return a short bullet list for AM/PM where relevant, and add 1–2 lines of rationale.\n\nSelectedProductsJSON:\n${JSON.stringify(picked, null, 2)}`;

  msg("user", "Generate a routine based on my selected products.");
  msg("assistant", "Thinking… ✨");

  try {
    chatHistory.push({ role: "user", content: userPrompt });
    const reply = await callWorker(chatHistory);
    chatWindow.lastElementChild.querySelector(".bubble").textContent = reply;
    chatHistory.push({ role: "assistant", content: reply });
    persistChat();
  } catch (err) {
    chatWindow.lastElementChild.querySelector(".bubble").textContent =
      "Sorry, I couldn't generate that. Check your Worker URL and API key.";
    console.error(err);
  }
});

/* ===== Follow-up chat ===== */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = e.currentTarget.userInput;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  const allowedTopics = /(routine|skin|skincare|hair|haircare|makeup|fragrance|suncare|spf|cleanser|moisturizer|serum|retinol|acne|dandruff|foundation|mascara|lipstick|shampoo|conditioner|toner|exfoliat|oil|moisture|hydration|dryness|oily|combination|sensitive|aging|wrinkle|pores|texture|hyperpigmentation|sun|spf|sunscreen|frizz|color)/i;
  const safeText = allowedTopics.test(text) ? text : `The user asked: "${text}". Please politely steer the conversation back to skincare, haircare, makeup, fragrance, or the generated routine.`;

  msg("user", text);
  msg("assistant", "…");

  try {
    chatHistory.push({ role: "user", content: safeText });
    const reply = await callWorker(chatHistory);
    chatWindow.lastElementChild.querySelector(".bubble").textContent = reply;
    chatHistory.push({ role: "assistant", content: reply });
    persistChat();
  } catch (err) {
    chatWindow.lastElementChild.querySelector(".bubble").textContent =
      "The chat service is unavailable. Verify your Worker endpoint.";
    console.error(err);
  }
});

/* ===== RTL toggle ===== */
(function initRTL(){
  const saved = localStorage.getItem("rtl") === "true";
  document.documentElement.setAttribute("dir", saved ? "rtl" : "ltr");
  if (rtlSwitch) rtlSwitch.checked = saved;
})();
rtlSwitch?.addEventListener("change", (e) => {
  const on = e.currentTarget.checked;
  document.documentElement.setAttribute("dir", on ? "rtl" : "ltr");
  localStorage.setItem("rtl", String(on));
});

/* ===== Boot ===== */
(async function init(){
  allProducts = await loadProducts();
  renderSelectedChips();
  applyFilters();
})();

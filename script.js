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
productsContainer.innerHTML = `<div class="placeholder-message">Select a category to view products</div>`;

/* ===== Load products from JSON ===== */
async function loadProducts() {
  const res = await fetch("products.json");
  const data = await res.json();
  return data.products;
}

/* ===== Renderers ===== */
function renderProducts(products) {
  if (!products.length) {
    productsContainer.innerHTML = `<div class="placeholder-message">No products found in this category.</div>`;
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

  // Bind per-card buttons
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

  // bind remove
  selectedProductsList.querySelectorAll(".chip-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.currentTarget.dataset.id);
      selectedIds.delete(id);
      saveSelections();
      // Re-render current product grid to update button state
      if (categoryFilter.value) {
        const filtered = allProducts.filter(p => p.category === categoryFilter.value);
        renderProducts(filtered);
      }
      renderSelectedChips();
    });
  });
}

/* ===== Feature: Toggle selection ===== */
function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  saveSelections();
  // Update grid based on current filter
  if (categoryFilter.value) {
    const filtered = allProducts.filter(p => p.category === categoryFilter.value);
    renderProducts(filtered);
  }
  renderSelectedChips();
}

/* ===== Feature: Show details (modal) ===== */
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
  // Close on backdrop click
  const card = productModal.querySelector(".modal__card");
  if (!card) return;
  const rect = card.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    productModal.close();
  }
});

/* ===== Filter by category ===== */
categoryFilter.addEventListener("change", async (e) => {
  const selectedCategory = e.target.value;
  const filtered = allProducts.filter(product => product.category === selectedCategory);
  renderProducts(filtered);
});

/* ===== Clear selections ===== */
clearSelectionsBtn.addEventListener("click", () => {
  selectedIds.clear();
  saveSelections();
  renderSelectedChips();
  // update grid
  if (categoryFilter.value) {
    const filtered = allProducts.filter(p => p.category === categoryFilter.value);
    renderProducts(filtered);
  }
});

/* ===== Generate Routine via Cloudflare Worker + OpenAI ===== */
async function callWorker(messages, opts = {}) {
  const body = {
    messages,
    temperature: 0.7,
    system: `You are a professional L’Oréal beauty advisor. Build routines only from the provided product JSON. Tailor by skin/hair type, concerns, and time of day. Keep advice safe and general; avoid medical claims. If asked about topics outside skincare, haircare, makeup, fragrance, or the generated routine, gently steer back.`,
    enableWebSearch: Boolean(window.ENABLE_WEB_SEARCH),
    ...opts
  };

  const res = await fetch(window.WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Worker error: ${res.status}`);
  const data = await res.json();
  return data.reply || "";
}

function selectedProductsData() {
  return [...selectedIds].map(id => productById(id)).filter(Boolean);
}

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
    // replace "Thinking…" bubble
    chatWindow.lastElementChild.querySelector(".bubble").textContent = reply;
    chatHistory.push({ role: "assistant", content: reply });
    persistChat();
  } catch (err) {
    chatWindow.lastElementChild.querySelector(".bubble").textContent = "Sorry, I couldn't generate that. Check your Worker URL and API key.";
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

  // Lightweight topic guard
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
    chatWindow.lastElementChild.querySelector(".bubble").textContent = "The chat service is unavailable. Verify your Worker endpoint.";
    console.error(err);
  }
});

/* ===== Boot ===== */
(async function init(){
  allProducts = await loadProducts();
  // hydrate selections from storage
  renderSelectedChips();
  // keep grid placeholder until user picks a category
  if (categoryFilter.value) {
    const filtered = allProducts.filter(p => p.category === categoryFilter.value);
    renderProducts(filtered);
  }
})();

(() => {
  "use strict";

  const RING_CIRCUMFERENCE = 2 * Math.PI * 176;

  const SIDE_MENU_ITEMS = [
    { key: "favorites", icon: "⭐", label: "Favourites" },
    { key: "mealIdeas", icon: "🍲", label: "Meal ideas" },
    { key: "myMeals", icon: "💚", label: "My meals" },
    { key: "breakfast", icon: "🌅", label: "Breakfast" },
    { key: "fruit", icon: "🍎", label: "Fruit" },
    { key: "vegetables", icon: "🥦", label: "Vegetables" },
    { key: "protein", icon: "🍗", label: "Protein" },
    { key: "meals", icon: "🍛", label: "Meals" },
    { key: "dairy", icon: "🥛", label: "Dairy" },
    { key: "snacks", icon: "🍪", label: "Snacks" },
    { key: "drinks", icon: "☕", label: "Drinks" },
  ];

  const MEAL_LABELS = {
    breakfast: { icon: "🌅", name: "Breakfast" },
    lunch: { icon: "🌞", name: "Lunch" },
    dinner: { icon: "🌙", name: "Dinner" },
    snacks: { icon: "🍎", name: "Snacks" },
  };

  const EMOJI_CHOICES = ["🍲", "🥗", "🍗", "🐟", "🍚", "🍝", "🥣", "🍞", "🥚", "🧀", "🍎", "🥦", "🥕", "🍪", "🫖", "🥛"];
  const SERVING_CHOICES = ["1 bowl", "1 plate", "1 piece", "1 cup", "1 handful"];

  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const state = {
    foods: [],
    meals: [],
    customFoods: [],
    favorites: [],
    settings: null,
    activeTab: "today",
    activeMeal: "breakfast",
    sideMenu: "favorites",
    searchQuery: "",
    todayKey: null,
    historyYear: null,
    historyMonth: null,
    selectedHistoryDay: null,
    settingsUnlocked: false,
    openMealId: null,
    mealModalGrams: {},
    customDraft: { emoji: EMOJI_CHOICES[0], name: "", calories: 100, serving: SERVING_CHOICES[0] },
  };

  // ---------- storage helpers ----------

  function todayKeyNow() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadJSONLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSONLS(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage full or unavailable — ignore, in-memory state still works this session */
    }
  }

  function getLog(dateKey) {
    return loadJSONLS(`log:${dateKey}`, []);
  }

  function saveLog(dateKey, entries) {
    saveJSONLS(`log:${dateKey}`, entries);
  }

  function getTodayLog() {
    return getLog(state.todayKey);
  }

  // ---------- data helpers ----------

  function allFoods() {
    return state.foods.concat(state.customFoods);
  }

  function findFood(foodId) {
    return allFoods().find((f) => f.id === foodId) || null;
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function computeSuggestedTarget(settings) {
    const bmr = 10 * settings.weightKg + 6.25 * settings.heightCm - 5 * settings.age - 161;
    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
    const mult = multipliers[settings.activityLevel] || 1.375;
    const target = bmr * mult - settings.deficit;
    return Math.max(1000, Math.round(target / 50) * 50);
  }

  function defaultSettings() {
    // Placeholder stats — set her real weight/height/age once via Settings after install.
    // Real values are stored only in this device's localStorage, never in the app source.
    const base = { weightKg: 70, heightCm: 165, age: 40, activityLevel: "light", deficit: 500 };
    return { ...base, dailyTarget: computeSuggestedTarget(base) };
  }

  // ---------- init ----------

  async function init() {
    const [foodsRes, mealsRes] = await Promise.all([fetch("foods.json"), fetch("meals.json")]);
    state.foods = await foodsRes.json();
    state.meals = await mealsRes.json();

    state.customFoods = loadJSONLS("customFoods", []);
    state.favorites = loadJSONLS("favorites", state.foods.slice(0, 6).map((f) => f.id));
    state.settings = loadJSONLS("settings", defaultSettings());

    state.todayKey = todayKeyNow();
    const now = new Date();
    state.historyYear = now.getFullYear();
    state.historyMonth = now.getMonth();

    bindTabBar();
    bindToday();
    bindHistory();
    bindSettings();
    bindEntriesPopup();
    bindMealModal();
    bindCustomFoodModal();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const nowKey = todayKeyNow();
        if (nowKey !== state.todayKey) {
          state.todayKey = nowKey;
          renderToday();
        }
      }
    });

    renderSideMenu();
    renderToday();
    renderHistory();
    renderSettings();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  // ---------- tab bar ----------

  function bindTabBar() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    if (tab !== "settings") {
      state.settingsUnlocked = false;
    }
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.hidden = screen.dataset.screen !== tab;
    });
    if (tab === "today") renderToday();
    if (tab === "history") renderHistory();
    if (tab === "settings") renderSettings();
  }

  // ---------- Today: header / ring ----------

  function renderToday() {
    const d = new Date();
    document.getElementById("today-date").textContent = d.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    document.getElementById("target-pill").textContent = `Target ${state.settings.dailyTarget.toLocaleString()} kcal`;

    renderRing();
    renderMealSelector();
    renderFoodGrid();
  }

  function todayEaten() {
    return getTodayLog().reduce((sum, e) => sum + e.calories, 0);
  }

  function renderRing() {
    const eaten = todayEaten();
    const target = state.settings.dailyTarget;
    const remaining = target - eaten;
    const over = remaining < 0;

    const progressEl = document.getElementById("ring-progress");
    const frac = Math.min(1, eaten / target);
    progressEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE - RING_CIRCUMFERENCE * frac);
    progressEl.classList.toggle("over", over);

    const remainingEl = document.getElementById("ring-remaining");
    remainingEl.textContent = over ? `+${Math.abs(remaining).toLocaleString()}` : remaining.toLocaleString();
    remainingEl.classList.toggle("over", over);
    document.getElementById("ring-remaining-label").textContent = "calories left";
    document.getElementById("ring-sub").textContent = `${eaten.toLocaleString()} eaten of ${target.toLocaleString()} kcal`;
  }

  function renderMealSelector() {
    const log = getTodayLog();
    document.querySelectorAll(".meal-btn").forEach((btn) => {
      const meal = btn.dataset.meal;
      btn.classList.toggle("active", meal === state.activeMeal);
      const subtotal = log.filter((e) => e.meal === meal).reduce((s, e) => s + e.calories, 0);
      const subEl = btn.querySelector(`[data-sub="${meal}"]`);
      subEl.textContent = subtotal > 0 ? `${subtotal.toLocaleString()} kcal` : "—";
    });
  }

  function bindToday() {
    document.querySelectorAll(".meal-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeMeal = btn.dataset.meal;
        renderMealSelector();
        updatePanelHint();
      });
    });

    document.getElementById("search-input").addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      renderFoodGrid();
    });

    document.getElementById("ring-center").addEventListener("click", (e) => {
      if (dragCtx.active) return;
      openEntriesPopup();
    });
  }

  // ---------- side menu ----------

  function renderSideMenu() {
    const nav = document.getElementById("side-menu");
    nav.innerHTML = "";
    SIDE_MENU_ITEMS.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "side-menu-btn" + (state.sideMenu === item.key ? " active" : "");
      btn.innerHTML = `<span class="icon">${item.icon}</span><span>${item.label}</span>`;
      btn.addEventListener("click", () => {
        state.sideMenu = item.key;
        state.searchQuery = "";
        document.getElementById("search-input").value = "";
        renderSideMenu();
        renderFoodGrid();
      });
      nav.appendChild(btn);
    });
  }

  function updatePanelHint() {
    const hintEl = document.getElementById("panel-hint");
    const mealName = MEAL_LABELS[state.activeMeal].name.toLowerCase();
    hintEl.textContent = `adding to ${mealName}`;
  }

  function currentPanelTitle() {
    if (state.searchQuery.trim()) return "Search results";
    const item = SIDE_MENU_ITEMS.find((i) => i.key === state.sideMenu);
    return item ? item.label : "Foods";
  }

  function mealDefaultTotal(meal) {
    return meal.ingredients.reduce((s, ing) => s + ing.caloriesAtGrams, 0);
  }

  function renderFoodGrid() {
    document.getElementById("panel-title").textContent = currentPanelTitle();
    updatePanelHint();

    const grid = document.getElementById("food-grid");
    grid.innerHTML = "";

    const query = state.searchQuery.trim().toLowerCase();

    if (query) {
      const results = allFoods().filter((f) => f.name.toLowerCase().includes(query));
      if (results.length === 0) {
        grid.appendChild(emptyState("Nothing found — try a shorter word."));
        return;
      }
      results.forEach((f) => grid.appendChild(foodCard(f)));
      return;
    }

    if (state.sideMenu === "mealIdeas") {
      if (state.meals.length === 0) {
        grid.appendChild(emptyState("Nothing in this group yet."));
        return;
      }
      state.meals.forEach((m) => grid.appendChild(mealIdeaCard(m)));
      return;
    }

    if (state.sideMenu === "myMeals") {
      if (state.customFoods.length === 0) {
        grid.appendChild(emptyState("No saved meals yet. Open Meal ideas and save one."));
        return;
      }
      state.customFoods.forEach((f) => grid.appendChild(foodCard(f)));
      grid.appendChild(addCard());
      return;
    }

    if (state.sideMenu === "favorites") {
      const favFoods = state.favorites.map(findFood).filter(Boolean);
      if (favFoods.length === 0) {
        grid.appendChild(emptyState("Nothing in this group yet."));
        return;
      }
      favFoods.forEach((f) => grid.appendChild(foodCard(f)));
      grid.appendChild(addCard());
      return;
    }

    const catFoods = state.foods.filter((f) => f.category === state.sideMenu);
    if (catFoods.length === 0) {
      grid.appendChild(emptyState("Nothing in this group yet."));
      return;
    }
    catFoods.forEach((f) => grid.appendChild(foodCard(f)));
    grid.appendChild(addCard());
  }

  function emptyState(text) {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.textContent = text;
    return div;
  }

  function addCard() {
    const div = document.createElement("button");
    div.type = "button";
    div.className = "add-card";
    div.textContent = "＋ Add a food that isn't here";
    div.addEventListener("click", openCustomFoodModal);
    return div;
  }

  function foodCard(food) {
    const card = document.createElement("div");
    card.className = "food-card";
    card.innerHTML = `
      <span class="emoji">${food.emoji}</span>
      <span class="name">${escapeHtml(food.name)}</span>
      <span class="cal">${food.calories} kcal</span>
    `;
    attachCardDrag(card, food);
    return card;
  }

  function mealIdeaCard(meal) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "food-card meal-idea";
    const total = mealDefaultTotal(meal);
    card.innerHTML = `
      <span class="emoji">${meal.emoji}</span>
      <span class="name">${escapeHtml(meal.name)}</span>
      <span class="cal">~${total} kcal</span>
    `;
    card.addEventListener("click", () => openMealModal(meal.id));
    return card;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- logging ----------

  function logFood(food, meal) {
    const entry = {
      id: uid("entry"),
      foodId: food.id,
      name: food.name,
      emoji: food.emoji,
      calories: food.calories,
      servingLabel: food.servingLabel,
      time: new Date().toTimeString().slice(0, 5),
      meal,
    };
    const log = getTodayLog();
    log.push(entry);
    saveLog(state.todayKey, log);
    renderRing();
    renderMealSelector();
    if (!document.getElementById("entries-overlay").hidden) renderEntriesPopup();
  }

  function removeEntry(entryId) {
    const log = getTodayLog().filter((e) => e.id !== entryId);
    saveLog(state.todayKey, log);
    renderRing();
    renderMealSelector();
    renderEntriesPopup();
  }

  // ---------- drag + tap ----------

  const dragCtx = {
    active: false,
    pointerId: null,
    food: null,
    ghost: null,
    startX: 0,
    startY: 0,
    moved: false,
  };

  const DRAG_THRESHOLD = 8;

  function attachCardDrag(card, food) {
    card.addEventListener("pointerdown", (e) => {
      if (dragCtx.active) return;
      dragCtx.active = true;
      dragCtx.pointerId = e.pointerId;
      dragCtx.food = food;
      dragCtx.startX = e.clientX;
      dragCtx.startY = e.clientY;
      dragCtx.moved = false;
      card.classList.add("pressed");

      const onMove = (ev) => {
        if (ev.pointerId !== dragCtx.pointerId) return;
        const dx = ev.clientX - dragCtx.startX;
        const dy = ev.clientY - dragCtx.startY;
        if (!dragCtx.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          dragCtx.moved = true;
          startGhost(food, ev.clientX, ev.clientY);
          setRingDragState(true);
        }
        if (dragCtx.moved) {
          moveGhost(ev.clientX, ev.clientY);
          setRingDragState(isOverRing(ev.clientX, ev.clientY));
        }
      };

      const onUp = (ev) => {
        if (ev.pointerId !== dragCtx.pointerId) return;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        card.classList.remove("pressed");
        setRingDragState(false);

        if (dragCtx.moved) {
          endGhost();
          if (isOverRing(ev.clientX, ev.clientY)) {
            logFood(food, state.activeMeal);
          }
        } else {
          logFood(food, state.activeMeal);
        }

        dragCtx.active = false;
        dragCtx.pointerId = null;
        dragCtx.food = null;
        dragCtx.moved = false;
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function startGhost(food, x, y) {
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = food.emoji;
    document.body.appendChild(ghost);
    dragCtx.ghost = ghost;
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    if (!dragCtx.ghost) return;
    dragCtx.ghost.style.transform = `translate(${x - 36}px, ${y - 40}px)`;
  }

  function endGhost() {
    if (dragCtx.ghost) {
      dragCtx.ghost.remove();
      dragCtx.ghost = null;
    }
  }

  function isOverRing(x, y) {
    const el = document.getElementById("ring-center");
    if (el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function setRingDragState(active) {
    const ring = document.getElementById("ring-center");
    ring.classList.toggle("drag-over", active);
    document.getElementById("ring-hint").textContent = active ? "Let go to add it" : "Tap a food, or drag it here";
  }

  // ---------- entries popup ----------

  function bindEntriesPopup() {
    document.getElementById("entries-close").addEventListener("click", closeEntriesPopup);
    document.getElementById("entries-overlay").addEventListener("click", (e) => {
      if (e.target.id === "entries-overlay") closeEntriesPopup();
    });
  }

  function openEntriesPopup() {
    document.getElementById("entries-overlay").hidden = false;
    renderEntriesPopup();
  }

  function closeEntriesPopup() {
    document.getElementById("entries-overlay").hidden = true;
  }

  function renderEntriesPopup() {
    const log = getTodayLog();
    const eaten = log.reduce((s, e) => s + e.calories, 0);
    document.getElementById("entries-sub").textContent = `${eaten.toLocaleString()} eaten of ${state.settings.dailyTarget.toLocaleString()} kcal`;

    const body = document.getElementById("entries-body");
    body.innerHTML = "";

    const order = ["breakfast", "lunch", "dinner", "snacks"];
    let any = false;
    order.forEach((meal) => {
      const entries = log.filter((e) => e.meal === meal);
      if (entries.length === 0) return;
      any = true;
      const subtotal = entries.reduce((s, e) => s + e.calories, 0);
      const head = document.createElement("div");
      head.className = "entry-group-head";
      head.innerHTML = `<span class="icon">${MEAL_LABELS[meal].icon}</span><span class="name">${MEAL_LABELS[meal].name}</span><span class="sub">${subtotal.toLocaleString()} kcal</span>`;
      body.appendChild(head);

      entries.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "entry-row";
        row.innerHTML = `
          <span class="emoji">${entry.emoji}</span>
          <span class="info">
            <span class="name">${escapeHtml(entry.name)}</span><br/>
            <span class="meta">${escapeHtml(entry.servingLabel || "")} · ${entry.time}</span>
          </span>
          <span class="cal">${entry.calories} kcal</span>
        `;
        const undoBtn = document.createElement("button");
        undoBtn.type = "button";
        undoBtn.className = "undo-btn";
        undoBtn.textContent = "Undo";
        undoBtn.addEventListener("click", () => removeEntry(entry.id));
        row.appendChild(undoBtn);
        body.appendChild(row);
      });
    });

    if (!any) {
      body.appendChild(emptyState("Nothing logged yet — tap a food to add it."));
    }
  }

  // ---------- meal idea modal (Modal A) ----------

  function bindMealModal() {
    document.getElementById("meal-modal-close").addEventListener("click", closeMealModal);
    document.getElementById("meal-modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "meal-modal-overlay") closeMealModal();
    });
    document.getElementById("meal-modal-save").addEventListener("click", saveMealAsCustomFood);
  }

  function openMealModal(mealId) {
    const meal = state.meals.find((m) => m.id === mealId);
    if (!meal) return;
    state.openMealId = mealId;
    state.mealModalGrams = {};
    meal.ingredients.forEach((ing, idx) => {
      state.mealModalGrams[idx] = ing.defaultGrams;
    });

    document.getElementById("meal-modal-emoji").textContent = meal.emoji;
    document.getElementById("meal-modal-name").textContent = meal.name;
    renderMealModalIngredients();
    document.getElementById("meal-modal-overlay").hidden = false;
  }

  function closeMealModal() {
    document.getElementById("meal-modal-overlay").hidden = true;
    state.openMealId = null;
  }

  function ingredientStep(defaultGrams) {
    return Math.max(5, Math.round(defaultGrams / 4 / 5) * 5);
  }

  function renderMealModalIngredients() {
    const meal = state.meals.find((m) => m.id === state.openMealId);
    if (!meal) return;
    const container = document.getElementById("meal-modal-ingredients");
    container.innerHTML = "";
    let total = 0;

    meal.ingredients.forEach((ing, idx) => {
      const grams = state.mealModalGrams[idx];
      const kcal = Math.round((ing.caloriesAtGrams * grams) / ing.defaultGrams);
      total += kcal;

      const row = document.createElement("div");
      row.className = "ingredient-row";
      row.innerHTML = `
        <span class="emoji">${ing.emoji}</span>
        <span class="info">
          <span class="name">${escapeHtml(ing.name)}</span><br/>
          <span class="qty">${grams} g · ${kcal} kcal</span>
        </span>
        <span class="steppers">
          <button type="button" class="mini-stepper-btn" data-act="minus">−</button>
          <button type="button" class="mini-stepper-btn" data-act="plus">+</button>
        </span>
      `;
      const step = ingredientStep(ing.defaultGrams);
      row.querySelector('[data-act="minus"]').addEventListener("click", () => {
        state.mealModalGrams[idx] = Math.max(0, state.mealModalGrams[idx] - step);
        renderMealModalIngredients();
      });
      row.querySelector('[data-act="plus"]').addEventListener("click", () => {
        state.mealModalGrams[idx] = state.mealModalGrams[idx] + step;
        renderMealModalIngredients();
      });
      container.appendChild(row);
    });

    document.getElementById("meal-modal-total").textContent = `${total} kcal`;
  }

  function saveMealAsCustomFood() {
    const meal = state.meals.find((m) => m.id === state.openMealId);
    if (!meal) return;
    let total = 0;
    meal.ingredients.forEach((ing, idx) => {
      const grams = state.mealModalGrams[idx];
      total += Math.round((ing.caloriesAtGrams * grams) / ing.defaultGrams);
    });

    const custom = {
      id: uid("custom"),
      name: meal.name,
      emoji: meal.emoji,
      category: "myMeals",
      calories: total,
      servingLabel: "your portion",
    };
    state.customFoods.push(custom);
    saveJSONLS("customFoods", state.customFoods);

    closeMealModal();
    state.sideMenu = "myMeals";
    state.searchQuery = "";
    document.getElementById("search-input").value = "";
    renderSideMenu();
    renderFoodGrid();
  }

  // ---------- custom food modal (Modal B) ----------

  function bindCustomFoodModal() {
    document.getElementById("custom-food-close").addEventListener("click", closeCustomFoodModal);
    document.getElementById("custom-food-overlay").addEventListener("click", (e) => {
      if (e.target.id === "custom-food-overlay") closeCustomFoodModal();
    });

    const picker = document.getElementById("emoji-picker");
    EMOJI_CHOICES.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-swatch";
      btn.textContent = emoji;
      btn.addEventListener("click", () => {
        state.customDraft.emoji = emoji;
        renderCustomFoodModal();
      });
      picker.appendChild(btn);
    });

    const chipRow = document.getElementById("serving-chip-row");
    SERVING_CHOICES.forEach((label) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = label;
      chip.addEventListener("click", () => {
        state.customDraft.serving = label;
        renderCustomFoodModal();
      });
      chipRow.appendChild(chip);
    });

    document.getElementById("custom-food-name").addEventListener("input", (e) => {
      state.customDraft.name = e.target.value;
      renderCustomFoodModal();
    });

    document.getElementById("custom-cal-minus").addEventListener("click", () => {
      state.customDraft.calories = Math.max(0, state.customDraft.calories - 10);
      renderCustomFoodModal();
    });
    document.getElementById("custom-cal-plus").addEventListener("click", () => {
      state.customDraft.calories += 10;
      renderCustomFoodModal();
    });

    document.getElementById("custom-food-save").addEventListener("click", saveCustomFood);
  }

  function openCustomFoodModal() {
    state.customDraft = { emoji: EMOJI_CHOICES[0], name: "", calories: 100, serving: SERVING_CHOICES[0] };
    document.getElementById("custom-food-name").value = "";
    renderCustomFoodModal();
    document.getElementById("custom-food-overlay").hidden = false;
  }

  function closeCustomFoodModal() {
    document.getElementById("custom-food-overlay").hidden = true;
  }

  function renderCustomFoodModal() {
    document.querySelectorAll(".emoji-swatch").forEach((el) => {
      el.classList.toggle("selected", el.textContent === state.customDraft.emoji);
    });
    document.querySelectorAll(".chip").forEach((el) => {
      el.classList.toggle("selected", el.textContent === state.customDraft.serving);
    });
    document.getElementById("custom-cal-value").textContent = state.customDraft.calories;

    document.getElementById("preview-emoji").textContent = state.customDraft.emoji;
    document.getElementById("preview-name").textContent = state.customDraft.name.trim() || "Your food";
    document.getElementById("preview-sub").textContent = `${state.customDraft.calories} kcal · ${state.customDraft.serving}`;

    document.getElementById("custom-food-save").disabled = state.customDraft.name.trim().length === 0;
  }

  function saveCustomFood() {
    if (state.customDraft.name.trim().length === 0) return;
    const custom = {
      id: uid("custom"),
      name: state.customDraft.name.trim(),
      emoji: state.customDraft.emoji,
      category: "myMeals",
      calories: state.customDraft.calories,
      servingLabel: state.customDraft.serving,
    };
    state.customFoods.push(custom);
    saveJSONLS("customFoods", state.customFoods);

    closeCustomFoodModal();
    state.sideMenu = "myMeals";
    state.searchQuery = "";
    document.getElementById("search-input").value = "";
    renderSideMenu();
    renderFoodGrid();
  }

  // ---------- History ----------

  function bindHistory() {
    // month nav injected in renderHistory via delegation
  }

  function dateKeyFor(year, month, day) {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }

  function renderHistory() {
    const label = document.getElementById("history-month-label");
    label.innerHTML = "";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "‹";
    prevBtn.style.cssText = "font-size:20px;font-weight:800;padding:4px 10px;color:var(--soft);";
    prevBtn.addEventListener("click", () => shiftMonth(-1));
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "›";
    nextBtn.style.cssText = "font-size:20px;font-weight:800;padding:4px 10px;color:var(--soft);";
    nextBtn.addEventListener("click", () => shiftMonth(1));
    const text = document.createElement("span");
    text.textContent = `${MONTH_NAMES[state.historyMonth]} ${state.historyYear}`;
    label.appendChild(prevBtn);
    label.appendChild(text);
    label.appendChild(nextBtn);

    const grid = document.getElementById("month-grid");
    grid.innerHTML = "";

    const firstOfMonth = new Date(state.historyYear, state.historyMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(state.historyYear, state.historyMonth + 1, 0).getDate();
    const todayKey = state.todayKey;

    for (let i = 0; i < startOffset; i++) {
      const blank = document.createElement("div");
      grid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKeyFor(state.historyYear, state.historyMonth, day);
      const entries = getLog(key);
      const total = entries.reduce((s, e) => s + e.calories, 0);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day-cell";

      if (key > todayKey) {
        cell.classList.add("future");
      } else if (key === todayKey) {
        cell.classList.add("today");
      } else if (entries.length === 0) {
        cell.classList.add("past");
      } else if (total > state.settings.dailyTarget) {
        cell.classList.add("over");
      } else {
        cell.classList.add("under");
      }

      if (key === state.selectedHistoryDay) cell.classList.add("selected");

      const showTotal = key <= todayKey && entries.length > 0;
      cell.innerHTML = `<span class="num">${day}</span>${showTotal ? `<span class="total">${total}</span>` : ""}`;

      if (key <= todayKey) {
        cell.addEventListener("click", () => {
          state.selectedHistoryDay = key;
          renderHistory();
          renderDayDetail(key);
        });
      } else {
        cell.disabled = true;
      }

      grid.appendChild(cell);
    }

    if (state.selectedHistoryDay) {
      renderDayDetail(state.selectedHistoryDay);
    } else {
      document.getElementById("day-detail").hidden = true;
    }
  }

  function shiftMonth(delta) {
    let m = state.historyMonth + delta;
    let y = state.historyYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    state.historyMonth = m;
    state.historyYear = y;
    renderHistory();
  }

  function renderDayDetail(key) {
    const panel = document.getElementById("day-detail");
    const entries = getLog(key);
    const total = entries.reduce((s, e) => s + e.calories, 0);

    const d = new Date(`${key}T00:00:00`);
    document.getElementById("day-detail-title").textContent = d.toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long",
    });
    document.getElementById("day-detail-total").textContent = `${total.toLocaleString()} kcal`;

    const rows = document.getElementById("day-detail-rows");
    rows.innerHTML = "";
    if (entries.length === 0) {
      rows.appendChild(emptyState("Nothing logged this day."));
    } else {
      entries.forEach((e) => {
        const row = document.createElement("div");
        row.className = "day-row";
        row.innerHTML = `<span class="emoji">${e.emoji}</span><span class="name">${escapeHtml(e.name)}</span><span class="cal">${e.calories} kcal</span>`;
        rows.appendChild(row);
      });
    }
    panel.hidden = false;
  }

  // ---------- Settings ----------

  function bindSettings() {
    document.getElementById("unlock-gate").addEventListener("click", () => {
      state.settingsUnlocked = true;
      renderSettings();
    });

    document.getElementById("target-minus").addEventListener("click", () => {
      if (!state.settingsUnlocked) return;
      state.settings.dailyTarget = Math.max(1000, state.settings.dailyTarget - 50);
      saveJSONLS("settings", state.settings);
      renderSettings();
      renderToday();
    });
    document.getElementById("target-plus").addEventListener("click", () => {
      if (!state.settingsUnlocked) return;
      state.settings.dailyTarget += 50;
      saveJSONLS("settings", state.settings);
      renderSettings();
      renderToday();
    });

    document.getElementById("add-food-btn").addEventListener("click", () => {
      if (!state.settingsUnlocked) return;
      openCustomFoodModal();
    });
  }

  function renderSettings() {
    const statusEl = document.getElementById("settings-status");
    statusEl.textContent = state.settingsUnlocked
      ? "Unlocked — you can edit below"
      : "Locked — nothing can change by accident";

    document.getElementById("unlock-gate").classList.toggle("hidden-gate", state.settingsUnlocked);
    document.getElementById("settings-panels").classList.toggle("unlocked", state.settingsUnlocked);

    const suggested = computeSuggestedTarget(state.settings);
    document.getElementById("target-suggestion-text").textContent =
      `Suggested ${suggested.toLocaleString()} kcal — from your stats, minus a ${state.settings.deficit} kcal deficit.`;
    document.getElementById("target-value").textContent = state.settings.dailyTarget.toLocaleString();

    renderStatsGrid();

    const favList = document.getElementById("favorites-list");
    favList.innerHTML = "";
    state.favorites.forEach((foodId, idx) => {
      const food = findFood(foodId);
      if (!food) return;
      const row = document.createElement("div");
      row.className = "favorite-row";
      row.innerHTML = `
        <span class="handle">≡</span>
        <span class="emoji">${food.emoji}</span>
        <span class="name">${escapeHtml(food.name)}</span>
        <span class="cal">${food.calories} kcal</span>
        <button type="button" class="remove-btn" aria-label="Remove">✕</button>
      `;
      row.querySelector(".remove-btn").addEventListener("click", () => {
        if (!state.settingsUnlocked) return;
        state.favorites.splice(idx, 1);
        saveJSONLS("favorites", state.favorites);
        renderSettings();
      });
      attachFavoriteReorder(row, idx);
      favList.appendChild(row);
    });
  }

  const ACTIVITY_LEVELS = [
    { key: "sedentary", label: "Sedentary" },
    { key: "light", label: "Light" },
    { key: "moderate", label: "Moderate" },
    { key: "active", label: "Active" },
  ];

  function updateStat(field, value) {
    state.settings[field] = value;
    saveJSONLS("settings", state.settings);
    renderSettings();
  }

  function statEditRow(label, value, unit, onMinus, onPlus) {
    const row = document.createElement("div");
    row.className = "stat-edit-row";
    row.innerHTML = `
      <span class="stat-edit-label">${label}</span>
      <span class="stat-edit-value">${value}${unit ? ` ${unit}` : ""}</span>
      <span class="steppers">
        <button type="button" class="mini-stepper-btn" data-act="minus">−</button>
        <button type="button" class="mini-stepper-btn" data-act="plus">+</button>
      </span>
    `;
    row.querySelector('[data-act="minus"]').addEventListener("click", () => {
      if (!state.settingsUnlocked) return;
      onMinus();
    });
    row.querySelector('[data-act="plus"]').addEventListener("click", () => {
      if (!state.settingsUnlocked) return;
      onPlus();
    });
    return row;
  }

  function renderStatsGrid() {
    const statsGrid = document.getElementById("stats-grid");
    statsGrid.innerHTML = "";

    statsGrid.appendChild(statEditRow(
      "Weight", state.settings.weightKg, "kg",
      () => updateStat("weightKg", Math.max(30, state.settings.weightKg - 1)),
      () => updateStat("weightKg", state.settings.weightKg + 1)
    ));
    statsGrid.appendChild(statEditRow(
      "Height", state.settings.heightCm, "cm",
      () => updateStat("heightCm", Math.max(100, state.settings.heightCm - 1)),
      () => updateStat("heightCm", state.settings.heightCm + 1)
    ));
    statsGrid.appendChild(statEditRow(
      "Age", state.settings.age, "",
      () => updateStat("age", Math.max(10, state.settings.age - 1)),
      () => updateStat("age", state.settings.age + 1)
    ));

    const activityRow = document.createElement("div");
    activityRow.className = "stat-activity-row";
    const activityLabel = document.createElement("span");
    activityLabel.className = "stat-edit-label";
    activityLabel.textContent = "Activity";
    activityRow.appendChild(activityLabel);
    const chipRow = document.createElement("div");
    chipRow.className = "chip-row";
    ACTIVITY_LEVELS.forEach((level) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (state.settings.activityLevel === level.key ? " selected" : "");
      chip.textContent = level.label;
      chip.addEventListener("click", () => {
        if (!state.settingsUnlocked) return;
        updateStat("activityLevel", level.key);
      });
      chipRow.appendChild(chip);
    });
    activityRow.appendChild(chipRow);
    statsGrid.appendChild(activityRow);
  }

  function attachFavoriteReorder(row, idx) {
    const handle = row.querySelector(".handle");
    handle.style.touchAction = "none";
    handle.addEventListener("pointerdown", (e) => {
      if (!state.settingsUnlocked) return;
      const list = document.getElementById("favorites-list");
      const rows = Array.from(list.children);
      let currentIdx = idx;

      const onMove = (ev) => {
        const y = ev.clientY;
        rows.forEach((r, i) => {
          const rect = r.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (i === currentIdx) return;
          if ((i < currentIdx && y < mid) || (i > currentIdx && y > mid)) {
            const [item] = state.favorites.splice(currentIdx, 1);
            state.favorites.splice(i, 0, item);
            currentIdx = i;
            saveJSONLS("favorites", state.favorites);
            renderSettings();
          }
        });
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  init();
})();

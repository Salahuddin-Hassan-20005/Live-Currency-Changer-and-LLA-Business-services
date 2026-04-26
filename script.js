const themeToggle = document.getElementById("themeToggle");
const themeText = document.getElementById("themeText");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
const amountValue = document.getElementById("amountValue");

window.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    document.body.classList.add("page-loaded");
  });

  const revealTargets = document.querySelectorAll("h1, .section-intro, .hero p, .hero-actions, .card");
  revealTargets.forEach((element) => element.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("visible");
        currentObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  revealTargets.forEach((element) => observer.observe(element));
});

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeText) {
    themeText.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  }
}

const savedTheme = localStorage.getItem("theme") || "light";
applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
  });
}

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });
}

document.querySelectorAll("a[href]").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      link.target === "_blank" ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    document.body.classList.remove("page-loaded");
    document.body.classList.add("page-leaving");
    setTimeout(() => {
      window.location.href = href;
    }, 220);
  });
});

const ratesForm = document.getElementById("ratesForm");
const baseCurrency = document.getElementById("baseCurrency");
const targetCurrencies = document.getElementById("targetCurrencies");
const statusText = document.getElementById("statusText");
const ratesList = document.getElementById("ratesList");
const contactForm = document.getElementById("contactForm");
const fullNameInput = document.getElementById("fullName");
const emailAddressInput = document.getElementById("emailAddress");
const contactMessageInput = document.getElementById("message");
const contactStatus = document.getElementById("contactStatus");
const CONTACT_API_ENDPOINT = "/api/messages";
const adminLoginForm = document.getElementById("adminLoginForm");
const adminUsernameInput = document.getElementById("adminUsername");
const adminPasswordInput = document.getElementById("adminPassword");
const adminStatus = document.getElementById("adminStatus");
const adminMessagesList = document.getElementById("adminMessagesList");
const adminLoginCard = document.getElementById("adminLoginCard");
const adminMessagesCard = document.getElementById("adminMessagesCard");
const ADMIN_TOKEN_KEY = "globalbridge_admin_token";
const ADMIN_LOGIN_ENDPOINT = "/api/admin/login";
const ADMIN_MESSAGES_ENDPOINT = "/api/admin/messages";
const USER_TOKEN_KEY = "globalbridge_user_token";
const USER_PROFILE_KEY = "globalbridge_user_profile";
const GUEST_MODE_KEY = "globalbridge_guest_mode";
const AUTH_SIGNUP_ENDPOINT = "/api/auth/signup";
const AUTH_LOGIN_ENDPOINT = "/api/auth/login";
const showLoginButton = document.getElementById("showLogin");
const showSignupButton = document.getElementById("showSignup");
const continueGuestButton = document.getElementById("continueGuest");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const signupNameInput = document.getElementById("signupName");
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");
const authStatus = document.getElementById("authStatus");
const currentPage = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();

function resolvePostAuthTarget() {
  const target = new URLSearchParams(window.location.search).get("next");
  if (!target || target.includes("://")) {
    return "index.html";
  }
  return target.startsWith("/") ? target.slice(1) : target;
}

function hasAccessMode() {
  return Boolean(localStorage.getItem(USER_TOKEN_KEY) || localStorage.getItem(GUEST_MODE_KEY) === "1");
}

function enableGuestModeAndContinue() {
  localStorage.setItem(GUEST_MODE_KEY, "1");
  window.location.href = resolvePostAuthTarget();
}

if (currentPage !== "auth.html" && currentPage !== "admin.html" && !hasAccessMode()) {
  const nextParam = encodeURIComponent(currentPage || "index.html");
  window.location.href = `auth.html?next=${nextParam}`;
}

if (currentPage === "auth.html" && hasAccessMode()) {
  window.location.href = resolvePostAuthTarget();
}

async function fetchRates(base, symbols) {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to fetch exchange rates.");
  }
  const data = await response.json();
  if (!data || data.result !== "success" || !data.rates) {
    throw new Error("Invalid response from exchange API.");
  }
  return symbols.reduce((acc, symbol) => {
    if (data.rates[symbol]) {
      acc[symbol] = data.rates[symbol];
    }
    return acc;
  }, {});
}

if (ratesForm && baseCurrency && targetCurrencies && statusText && ratesList && amountValue) {
  ratesForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const base = baseCurrency.value;
    const amount = Number(amountValue.value);
    const selectedTargets = Array.from(targetCurrencies.selectedOptions).map((opt) => opt.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      statusText.textContent = "Please enter a valid amount greater than zero.";
      ratesList.innerHTML = "";
      return;
    }

    if (selectedTargets.length === 0) {
      statusText.textContent = "Please select at least one target currency.";
      ratesList.innerHTML = "";
      return;
    }

    statusText.textContent = "Fetching latest rates...";
    ratesList.innerHTML = "";

    try {
      const data = await fetchRates(base, selectedTargets.filter((code) => code !== base));
      const renderedTargets =
        selectedTargets.includes(base) ? [base, ...selectedTargets.filter((code) => code !== base)] : selectedTargets;

      renderedTargets.forEach((code) => {
        const li = document.createElement("li");
        if (code === base) {
          li.textContent = `${amount.toFixed(2)} ${base} = ${amount.toFixed(2)} ${base}`;
        } else {
          const value = data[code];
          const converted = value ? amount * Number(value) : null;
          li.textContent = value
            ? `${amount.toFixed(2)} ${base} = ${converted.toFixed(2)} ${code} (Rate: ${Number(value).toFixed(6)})`
            : `Rate for ${code} is currently unavailable.`;
        }
        ratesList.appendChild(li);
      });

      statusText.textContent = `Live rates updated (${new Date().toLocaleTimeString()}).`;
    } catch (error) {
      statusText.textContent = "Could not load rates right now. Please try again.";
      ratesList.innerHTML = "";
    }
  });
}

function renderStoredMessages(messages) {
  if (!adminMessagesList) {
    return;
  }

  if (messages.length === 0) {
    adminMessagesList.innerHTML = "<p>No messages found in database.</p>";
    return;
  }

  adminMessagesList.innerHTML = messages
    .map(
      (item) => `
      <article class="message-item">
        <strong>${item.fullName}</strong>
        <div class="message-meta">${item.emailAddress} | ${new Date(item.createdAt).toLocaleString()}</div>
        <p>${item.message}</p>
      </article>
    `
    )
    .join("");
}

function shouldUseApiStorage() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function submitApiMessage(messagePayload) {
  const response = await fetch(CONTACT_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messagePayload)
  });
  if (!response.ok) {
    throw new Error("Failed to save API message.");
  }
}

async function loginOrSignup(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(responseData.error || "Authentication failed.");
  }
  return responseData;
}

if (contactForm && fullNameInput && emailAddressInput && contactMessageInput) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = fullNameInput.value.trim();
    const emailAddress = emailAddressInput.value.trim();
    const message = contactMessageInput.value.trim();

    if (!fullName || !emailAddress || !message) {
      if (contactStatus) {
        contactStatus.textContent = "Please fill all fields before submitting.";
      }
      return;
    }

    if (!shouldUseApiStorage()) {
      if (contactStatus) {
        contactStatus.textContent = "Run this page through the server to submit messages.";
      }
      return;
    }

    const newMessage = {
      fullName,
      emailAddress,
      message
    };

    try {
      await submitApiMessage(newMessage);
      contactForm.reset();
      if (contactStatus) {
        contactStatus.textContent = "Inquiry submitted successfully.";
      }
    } catch {
      if (contactStatus) {
        contactStatus.textContent = "Could not submit inquiry. Please try again.";
      }
    }
  });
}

async function loginAdmin(username, password) {
  const response = await fetch(ADMIN_LOGIN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    throw new Error("Invalid username or password.");
  }
  const payload = await response.json();
  return payload.token;
}

async function fetchAdminMessages(token) {
  const response = await fetch(ADMIN_MESSAGES_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Unauthorized" : "Failed to load messages.");
  }
  const payload = await response.json();
  return Array.isArray(payload.messages) ? payload.messages : [];
}

async function renderAdminDashboard(token) {
  if (!adminLoginCard || !adminMessagesCard) {
    return;
  }
  const messages = await fetchAdminMessages(token);
  renderStoredMessages(messages);
  adminLoginCard.classList.add("hidden");
  adminMessagesCard.classList.remove("hidden");
}

if (adminLoginForm && adminUsernameInput && adminPasswordInput) {
  const existingToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (existingToken) {
    renderAdminDashboard(existingToken).catch(() => {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    });
  }

  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = adminUsernameInput.value.trim();
    const password = adminPasswordInput.value;

    try {
      const token = await loginAdmin(username, password);
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      if (adminStatus) {
        adminStatus.textContent = "Login successful.";
      }
      await renderAdminDashboard(token);
      adminLoginForm.reset();
    } catch {
      if (adminStatus) {
        adminStatus.textContent = "Login failed. Check username/password.";
      }
    }
  });
}

if (currentPage === "auth.html") {
  if (showLoginButton && showSignupButton && loginForm && signupForm) {
    showLoginButton.addEventListener("click", () => {
      loginForm.classList.remove("hidden");
      signupForm.classList.add("hidden");
    });
    showSignupButton.addEventListener("click", () => {
      signupForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
    });
  }

  if (continueGuestButton) {
    continueGuestButton.addEventListener("click", enableGuestModeAndContinue);
  }

  if (loginForm && loginEmailInput && loginPasswordInput) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await loginOrSignup(AUTH_LOGIN_ENDPOINT, {
          emailAddress: loginEmailInput.value.trim(),
          password: loginPasswordInput.value
        });
        localStorage.setItem(USER_TOKEN_KEY, result.token);
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(result.user));
        localStorage.removeItem(GUEST_MODE_KEY);
        window.location.href = resolvePostAuthTarget();
      } catch (error) {
        if (authStatus) {
          authStatus.textContent = error.message;
        }
      }
    });
  }

  if (signupForm && signupNameInput && signupEmailInput && signupPasswordInput) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await loginOrSignup(AUTH_SIGNUP_ENDPOINT, {
          fullName: signupNameInput.value.trim(),
          emailAddress: signupEmailInput.value.trim(),
          password: signupPasswordInput.value
        });
        localStorage.setItem(USER_TOKEN_KEY, result.token);
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(result.user));
        localStorage.removeItem(GUEST_MODE_KEY);
        window.location.href = resolvePostAuthTarget();
      } catch (error) {
        if (authStatus) {
          authStatus.textContent = error.message;
        }
      }
    });
  }
}

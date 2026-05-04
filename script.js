const API = "http://localhost:5000/api";
let currentUser = null;
let currentUserName = "";
let allRooms = [];

/* =============== UTILITIES =============== */

function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icons = { success: "✅", error: "❌", info: "ℹ️" };
    toast.innerHTML = `<span>${icons[type] || ""}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(40px)"; setTimeout(() => toast.remove(), 300); }, 3500);
}

function showAuthMessage(text, type) {
    const el = document.getElementById("authMessage");
    el.textContent = text;
    el.className = `auth-message ${type}`;
}

function hideAuthMessage() {
    const el = document.getElementById("authMessage");
    el.className = "auth-message";
    el.textContent = "";
}

/* =============== TAB SWITCHING =============== */

function switchTab(tab) {
    const signinTab = document.getElementById("signinTab");
    const signupTab = document.getElementById("signupTab");
    const signinForm = document.getElementById("signinForm");
    const signupForm = document.getElementById("signupForm");
    const indicator = document.getElementById("tabIndicator");

    hideAuthMessage();

    if (tab === "signin") {
        signinTab.classList.add("active");
        signupTab.classList.remove("active");
        signinForm.classList.add("active");
        signupForm.classList.remove("active");
        indicator.classList.remove("right");
    } else {
        signupTab.classList.add("active");
        signinTab.classList.remove("active");
        signupForm.classList.add("active");
        signinForm.classList.remove("active");
        indicator.classList.add("right");
    }
}

/* =============== AUTH =============== */

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPass").value;

    if (!name || !email || !password) { showAuthMessage("Please fill all fields", "error"); return; }

    const btn = document.getElementById("signupBtn");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Creating...";

    try {
        const res = await fetch(API + "/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();

        if (data.msg && data.msg.includes("✅")) {
            showAuthMessage("Account created! Please sign in.", "success");
            document.getElementById("regName").value = "";
            document.getElementById("regEmail").value = "";
            document.getElementById("regPass").value = "";
            setTimeout(() => switchTab("signin"), 1500);
        } else {
            showAuthMessage(data.msg || "Registration failed", "error");
        }
    } catch (err) {
        showAuthMessage("Server error. Is the backend running?", "error");
    }

    btn.disabled = false;
    btn.querySelector("span").textContent = "Create Account";
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPass").value;

    if (!email || !password) { showAuthMessage("Please fill all fields", "error"); return; }

    const btn = document.getElementById("signinBtn");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Signing in...";

    try {
        const res = await fetch(API + "/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.userId) {
            currentUser = data.userId;
            currentUserName = email.split("@")[0];
            showAuthMessage("Login successful! Redirecting...", "success");
            setTimeout(() => navigateToRooms(), 800);
        } else {
            showAuthMessage(data.msg || "Login failed", "error");
        }
    } catch (err) {
        showAuthMessage("Server error. Is the backend running?", "error");
    }

    btn.disabled = false;
    btn.querySelector("span").textContent = "Sign In";
}

/* =============== NAVIGATION =============== */

function navigateToRooms() {
    document.getElementById("authPage").classList.remove("active");
    document.getElementById("roomsPage").classList.add("active");
    document.getElementById("navGreeting").textContent = `Welcome, ${currentUserName}!`;
    loadRooms();
}

function logout() {
    currentUser = null;
    currentUserName = "";
    document.getElementById("roomsPage").classList.remove("active");
    document.getElementById("authPage").classList.add("active");
    hideAuthMessage();
    document.getElementById("loginEmail").value = "";
    document.getElementById("loginPass").value = "";
    showToast("Logged out successfully", "info");
}

/* =============== ROOMS =============== */

async function loadRooms() {
    const grid = document.getElementById("roomsGrid");
    const loading = document.getElementById("loadingState");
    const empty = document.getElementById("emptyState");

    grid.innerHTML = "";
    loading.style.display = "flex";
    empty.style.display = "none";

    try {
        const res = await fetch(API + "/rooms/available");
        allRooms = await res.json();
        applyFilters();
    } catch (err) {
        loading.style.display = "none";
        showToast("Failed to load rooms", "error");
    }
}

function applyFilters() {
    const floor = document.getElementById("filterFloor").value;
    const type = document.getElementById("filterType").value;
    const sort = document.getElementById("filterSort").value;

    let filtered = [...allRooms];

    if (floor) filtered = filtered.filter(r => r.floor === Number(floor));
    if (type) filtered = filtered.filter(r => r.type === type);

    if (sort === "low") filtered.sort((a, b) => a.price - b.price);
    else if (sort === "high") filtered.sort((a, b) => b.price - a.price);

    renderRooms(filtered);
}

function clearFilters() {
    document.getElementById("filterFloor").value = "";
    document.getElementById("filterType").value = "";
    document.getElementById("filterSort").value = "";
    applyFilters();
}

function renderRooms(rooms) {
    const grid = document.getElementById("roomsGrid");
    const loading = document.getElementById("loadingState");
    const empty = document.getElementById("emptyState");

    loading.style.display = "none";

    if (rooms.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        document.getElementById("statShowing").textContent = "0";
        document.getElementById("statBeds").textContent = "0";
        return;
    }

    empty.style.display = "none";

    const totalBeds = rooms.reduce((sum, r) => sum + r.availableBeds, 0);
    document.getElementById("statShowing").textContent = rooms.length;
    document.getElementById("statBeds").textContent = totalBeds;

    grid.innerHTML = rooms.map(room => {
        const bedsHTML = room.beds.map(b =>
            `<div class="bed-dot ${b.isBooked ? 'booked' : 'available'}" title="Bed ${b.bedNumber} - ${b.isBooked ? 'Booked' : 'Available'}">${b.bedNumber}</div>`
        ).join("");

        const sharingNum = room.type.split("-")[0];
        const hasAvailable = room.availableBeds > 0;

        return `
        <div class="room-card">
            <div class="room-card-header">
                <div>
                    <div class="room-number">Room ${room.roomNumber}</div>
                    <div class="room-floor">Floor ${room.floor}</div>
                </div>
                <span class="room-badge ${room.isAC ? 'badge-ac' : 'badge-nonac'}">
                    ${room.isAC ? '❄️ AC' : 'Non-AC'}
                </span>
            </div>
            <div class="room-specs">
                <div class="spec-item">
                    <span class="spec-label">Type</span>
                    <span class="spec-value">${sharingNum} Sharing</span>
                </div>
                <div class="spec-item">
                    <span class="spec-label">Available</span>
                    <span class="spec-value">${room.availableBeds} / ${room.beds.length} beds</span>
                </div>
                <div class="spec-item">
                    <span class="spec-label">Floor</span>
                    <span class="spec-value">${room.floor}${room.floor >= 6 ? ' (AC Zone)' : ''}</span>
                </div>
                <div class="spec-item">
                    <span class="spec-label">Status</span>
                    <span class="spec-value" style="color: var(--success);">Available</span>
                </div>
            </div>
            <div class="room-beds-bar">${bedsHTML}</div>
            <div class="room-card-footer">
                <div class="room-price">₹${room.price.toLocaleString()} <small>/day</small></div>
                <button class="btn-book-room" ${!hasAvailable ? 'disabled' : ''} onclick='openBookingModal(${JSON.stringify(room).replace(/'/g, "&#39;")})'>
                    ${hasAvailable ? 'Book Now' : 'Full'}
                </button>
            </div>
        </div>`;
    }).join("");
}

/* =============== BOOKING MODAL =============== */

let selectedRoom = null;

function openBookingModal(room) {
    selectedRoom = room;
    document.getElementById("bookRoomId").value = room._id;
    document.getElementById("modalTitle").textContent = `Book Room ${room.roomNumber}`;
    document.getElementById("modalRoomInfo").innerHTML =
        `Floor ${room.floor} · ${room.type} · ${room.isAC ? 'AC ❄️' : 'Non-AC'} · ₹${room.price.toLocaleString()}/day`;

    // Populate available beds
    const bedSelect = document.getElementById("bookBed");
    bedSelect.innerHTML = room.beds
        .filter(b => !b.isBooked)
        .map(b => `<option value="${b.bedNumber}">Bed ${b.bedNumber}</option>`)
        .join("");

    // Set min dates
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("bookCheckIn").min = today;
    document.getElementById("bookCheckIn").value = today;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    document.getElementById("bookCheckOut").min = tomorrowStr;
    document.getElementById("bookCheckOut").value = tomorrowStr;

    updatePricePreview();
    document.getElementById("bookingModal").classList.add("open");
}

function closeModal() {
    document.getElementById("bookingModal").classList.remove("open");
    selectedRoom = null;
}

function updatePricePreview() {
    if (!selectedRoom) return;
    const checkIn = document.getElementById("bookCheckIn").value;
    const checkOut = document.getElementById("bookCheckOut").value;
    if (checkIn && checkOut) {
        const days = Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)));
        const total = days * selectedRoom.price;
        document.getElementById("priceAmount").textContent = `₹${total.toLocaleString()}`;
    }
}

// Price preview listeners
document.getElementById("bookCheckIn").addEventListener("change", updatePricePreview);
document.getElementById("bookCheckOut").addEventListener("change", updatePricePreview);

// Close modal on overlay click
document.getElementById("bookingModal").addEventListener("click", function(e) {
    if (e.target === this) closeModal();
});

/* =============== HANDLE BOOKING =============== */

async function handleBooking(e) {
    e.preventDefault();
    if (!currentUser) { showToast("Please login first", "error"); return; }

    const roomId = document.getElementById("bookRoomId").value;
    const bedNumber = document.getElementById("bookBed").value;
    const checkIn = document.getElementById("bookCheckIn").value;
    const checkOut = document.getElementById("bookCheckOut").value;

    const btn = document.getElementById("confirmBookBtn");
    btn.disabled = true;
    btn.querySelector("span").textContent = "Booking...";

    try {
        const res = await fetch(API + "/book", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId, bedNumber: Number(bedNumber), userId: currentUser, checkIn, checkOut })
        });
        const data = await res.json();

        if (data.msg && data.msg.includes("✅")) {
            showToast(`Booking confirmed! Total: ₹${data.totalAmount?.toLocaleString() || '---'}`, "success");
            closeModal();
            loadRooms();
        } else {
            showToast(data.msg || "Booking failed", "error");
        }
    } catch (err) {
        showToast("Server error", "error");
    }

    btn.disabled = false;
    btn.querySelector("span").textContent = "Confirm Booking";
}
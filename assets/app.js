// API Base URL
const API_URL = 'http://localhost:3000/api';

// Global state
let token = localStorage.getItem('token') || null;
let userRole = localStorage.getItem('role') || null;
let isVerified = localStorage.getItem('is_verified') === 'true';

// DOM Elements
const sections = document.querySelectorAll('.page-section');
const navBtns = document.querySelectorAll('.nav-btn');
const toastEl = document.getElementById('toast');

// Navigation logic
function navigateTo(sectionId) {
    sections.forEach(s => s.classList.remove('active'));
    navBtns.forEach(b => b.classList.remove('active'));
    
    document.getElementById(sectionId).classList.add('active');
    
    const activeBtn = document.querySelector(`[data-target="${sectionId}"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // Trigger loads based on section
    if (sectionId === 'home-section') loadPublicServices();
    if (sectionId === 'dashboard-section') loadDashboard();
    if (sectionId === 'admin-section') loadAdminHub();
}

navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(e.target.id === 'nav-logout-btn') {
            logout();
        } else if (e.target.dataset.target) {
            navigateTo(e.target.dataset.target);
        }
    });
});

document.querySelectorAll('.go-to-auth').forEach(btn => {
    btn.addEventListener('click', () => navigateTo('auth-section'));
});

// Auth Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        
        e.target.classList.add('active');
        document.getElementById(`${e.target.dataset.tab}-form`).classList.add('active');
    });
});

// Toast functionality
function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast show ${type}`;
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}

// Update UI based on Auth State
function updateUI() {
    const loginBtn = document.getElementById('nav-login-btn');
    const dashboardBtn = document.getElementById('nav-dashboard-btn');
    const adminBtn = document.getElementById('nav-admin-btn');
    const logoutBtn = document.getElementById('nav-logout-btn');

    if (token) {
        loginBtn.classList.add('d-none');
        logoutBtn.classList.remove('d-none');
        
        if (userRole === 'admin') {
            adminBtn.classList.remove('d-none');
            dashboardBtn.classList.add('d-none');
        } else {
            dashboardBtn.classList.remove('d-none');
            adminBtn.classList.add('d-none');
        }
    } else {
        loginBtn.classList.remove('d-none');
        logoutBtn.classList.add('d-none');
        dashboardBtn.classList.add('d-none');
        adminBtn.classList.add('d-none');
    }
}

// Helper: Custom Fetch
async function apiFetch(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
    
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'API Error');
    }
    return data;
}

// --- AUTHENTICATION ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const payload = {
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value
        };
        const res = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
        
        token = res.token;
        userRole = res.role;
        isVerified = res.is_verified === 1 || res.is_verified === true;
        
        localStorage.setItem('token', token);
        localStorage.setItem('role', userRole);
        localStorage.setItem('is_verified', isVerified);
        
        showToast('Login successful!');
        updateUI();
        
        navigateTo(userRole === 'admin' ? 'admin-section' : 'dashboard-section');
    } catch (err) {
        showToast(err.message, 'error');
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const payload = {
            email: document.getElementById('reg-email').value,
            password: document.getElementById('reg-password').value,
            company_name: document.getElementById('reg-company').value,
            description: document.getElementById('reg-desc').value
        };
        const res = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        showToast(res.message);
        document.querySelector('[data-tab="login"]').click(); // Switch to login
    } catch (err) {
        showToast(err.message, 'error');
    }
});

function logout() {
    token = null;
    userRole = null;
    isVerified = false;
    localStorage.clear();
    updateUI();
    navigateTo('home-section');
    showToast('Logged out successfully');
}

// --- PUBLIC SERVICES ---
async function loadPublicServices() {
    try {
        const services = await apiFetch('/services');
        const container = document.getElementById('public-services-list');
        container.innerHTML = services.length === 0 ? '<p>No services available currently.</p>' : '';
        
        services.forEach(s => {
            container.innerHTML += `
                <div class="glass-card service-card">
                    <span class="company-tag"><i class="fa-solid fa-building"></i> ${s.company_name}</span>
                    <h3>${s.title}</h3>
                    <p>${s.description}</p>
                    <div class="price">$${s.price.toFixed(2)}</div>
                    <button class="btn btn-secondary btn-block">Inquire</button>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
    }
}

// --- DASHBOARD ---
const addServiceBtn = document.getElementById('add-service-btn');
const serviceFormContainer = document.getElementById('service-form-container');

addServiceBtn.addEventListener('click', () => {
    if (!isVerified) {
        return showToast('Your business is not verified yet. You cannot add services.', 'error');
    }
    serviceFormContainer.classList.remove('d-none');
});

document.getElementById('cancel-service-btn').addEventListener('click', () => {
    serviceFormContainer.classList.add('d-none');
});

document.getElementById('add-service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const payload = {
            title: document.getElementById('srv-title').value,
            price: parseFloat(document.getElementById('srv-price').value),
            description: document.getElementById('srv-desc').value
        };
        await apiFetch('/services', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Service created successfully');
        document.getElementById('add-service-form').reset();
        serviceFormContainer.classList.add('d-none');
        loadDashboard(); // Refresh
    } catch (err) {
        showToast(err.message, 'error');
    }
});

async function loadDashboard() {
    try {
        const profile = await apiFetch('/auth/me');
        isVerified = profile.is_verified === 1;
        localStorage.setItem('is_verified', isVerified); // sync state

        const statusEl = document.getElementById('business-status');
        if (isVerified) {
            statusEl.innerHTML = `Status: <span class="badge verified">Verified</span>`;
            addServiceBtn.disabled = false;
        } else {
            statusEl.innerHTML = `Status: <span class="badge pending">Pending Verification</span>`;
            addServiceBtn.disabled = true;
        }

        const servicesBox = document.getElementById('business-services-list');
        servicesBox.innerHTML = '<p>Loading your services...</p>';

        // Get services and filter locally for now
        const allServices = await apiFetch('/services');
        const myServices = allServices.filter(s => s.business_id === profile.id);

        servicesBox.innerHTML = myServices.length === 0 ? '<p>You have no active services.</p>' : '';
        myServices.forEach(s => {
            servicesBox.innerHTML += `
                <div class="glass-card service-card">
                    <h3>${s.title}</h3>
                    <p>${s.description}</p>
                    <div class="price">$${s.price.toFixed(2)}</div>
                    <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:1rem;">
                        <button class="action-btn danger" onclick="deleteService(${s.id})"><i class="fa-solid fa-trash"></i> Delete</button>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        showToast(err.message, 'error');
    }
}

window.deleteService = async (id) => {
    if(!confirm("Are you sure you want to delete this service?")) return;
    try {
        await apiFetch(`/services/${id}`, { method: 'DELETE' });
        showToast('Service deleted');
        loadDashboard();
    } catch(err) {
        showToast(err.message, 'error');
    }
};

// --- ADMIN HUB ---
async function loadAdminHub() {
    try {
        const businesses = await apiFetch('/admin/businesses');
        const tbody = document.getElementById('admin-businesses-list');
        tbody.innerHTML = businesses.length === 0 ? '<tr><td colspan="6">No businesses registered.</td></tr>' : '';
        
        businesses.forEach(b => {
            const isV = b.is_verified === 1;
            const statusBadge = isV ? '<span class="badge verified">Verified</span>' : '<span class="badge pending">Pending</span>';
            const actionBtn = isV 
                ? `<button class="action-btn danger" onclick="verifyBusiness(${b.id}, false)">Revoke</button>`
                : `<button class="action-btn success" onclick="verifyBusiness(${b.id}, true)">Verify</button>`;
                
            tbody.innerHTML += `
                <tr>
                    <td>#${b.id}</td>
                    <td><strong>${b.company_name}</strong><br><small>${b.description.substring(0,30)}...</small></td>
                    <td>${b.email}</td>
                    <td>${statusBadge}</td>
                    <td>${new Date(b.created_at).toLocaleDateString()}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
        });
    } catch (err) {
        showToast('Failed to load businesses', 'error');
    }
}

window.verifyBusiness = async (id, status) => {
    try {
        await apiFetch(`/admin/businesses/${id}/verify`, { 
            method: 'PUT',
            body: JSON.stringify({ is_verified: status })
        });
        showToast('Verification updated');
        loadAdminHub();
    } catch(err) {
        showToast(err.message, 'error');
    }
};

// Initialize
updateUI();
loadPublicServices();

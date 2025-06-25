// dashboard2x.js
// @ts-nocheck

// lobal loader management
if (window.VESPA_DASHBOARD_LOADED) {
    console.log('VESPA Dashboard script already loaded');
    // Already loaded, do not initialize again
} else {
    window.VESPA_DASHBOARD_LOADED = true;
}

const GlobalLoader = {
    overlay: null,
    progressBar: null,
    progressText: null,
    
    init() {
        // Remove any existing loader first
        const existing = document.getElementById('global-loading-overlay');
        if (existing) {
            existing.remove();
        }
        
        // Create loader HTML immediately
        const loaderHTML = `
            <div class="global-loading-overlay active" id="global-loading-overlay" style="z-index: 999999 !important;">
                <div class="loading-content">
                    <div class="spinner"></div>
                    <div class="loading-text">Initializing VESPA Dashboard</div>
                    <div class="loading-subtext">Loading your performance data...</div>
                    <div class="loading-progress">
                        <div class="loading-progress-bar" id="loading-progress-bar"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Insert at the end of body to ensure it's on top of everything
        document.body.insertAdjacentHTML('beforeend', loaderHTML);
        
        this.overlay = document.getElementById('global-loading-overlay');
        this.progressBar = document.getElementById('loading-progress-bar');
        this.progressText = this.overlay.querySelector('.loading-subtext');
        
        // Force the overlay to the top by ensuring proper z-index
        if (this.overlay) {
            this.overlay.style.position = 'fixed';
            this.overlay.style.top = '0';
            this.overlay.style.left = '0';
            this.overlay.style.width = '100%';
            this.overlay.style.height = '100%';
        }
    },
    
    updateProgress(percentage, text) {
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
        }
        if (this.progressText && text) {
            this.progressText.textContent = text;
        }
    },
    
    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            // Remove after animation
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }
            }, 300);
        }
    }
};

// Initialize loader immediately
GlobalLoader.init();

// Enhanced Data cache management with localStorage fallback
const DataCache = {
    vespaResults: null,
    nationalBenchmark: null,
    filterOptions: null,
    psychometricResponses: null,
    lastFetchTime: null,
    cacheTimeout: 10 * 60 * 1000, // 10 minutes (increased from 5)
    isLoading: false, // Add loading flag
    
    // Store in localStorage for persistence
    saveToLocalStorage(key, value) {
        try {
            const cacheData = {
                data: value,
                timestamp: Date.now()
            };
            localStorage.setItem(`vespa_cache_${key}`, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    },
    
    getFromLocalStorage(key) {
        try {
            const cached = localStorage.getItem(`vespa_cache_${key}`);
            if (cached) {
                const cacheData = JSON.parse(cached);
                // Check if cache is still valid (30 minutes for localStorage)
                if (Date.now() - cacheData.timestamp < 30 * 60 * 1000) {
                    return cacheData.data;
                }
            }
        } catch (e) {
            console.warn('Failed to read from localStorage:', e);
        }
        return null;
    },
    
    set(key, value) {
        this[key] = value;
        this.lastFetchTime = Date.now();
        // Also save to localStorage
        this.saveToLocalStorage(key, value);
    },
    
    get(key) {
        // Check memory cache first
        if (this.lastFetchTime && (Date.now() - this.lastFetchTime) < this.cacheTimeout) {
            return this[key];
        }
        // Fall back to localStorage
        const localData = this.getFromLocalStorage(key);
        if (localData) {
            this[key] = localData;
            return localData;
        }
        return null;
    },
    
    clear() {
        this.vespaResults = null;
        this.nationalBenchmark = null;
        this.filterOptions = null;
        this.psychometricResponses = null;
        this.lastFetchTime = null;
        this.isLoading = false;
        // Clear localStorage
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('vespa_cache_')) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Failed to clear localStorage:', e);
        }
    },
    
    isValid() {
        return this.lastFetchTime && (Date.now() - this.lastFetchTime) < this.cacheTimeout;
    }
};

// Add initialization guard
let dashboardInitialized = false;
let initializationInProgress = false;

// Recent establishments tracking for Super Users
const RecentEstablishments = {
    maxRecent: 5,
    
    add(establishmentId, establishmentName) {
        try {
            let recent = this.get();
            // Remove if already exists
            recent = recent.filter(e => e.id !== establishmentId);
            // Add to front
            recent.unshift({ id: establishmentId, name: establishmentName, timestamp: Date.now() });
            // Keep only max
            recent = recent.slice(0, this.maxRecent);
            localStorage.setItem('vespa_recent_establishments', JSON.stringify(recent));
        } catch (e) {
            console.warn('Failed to save recent establishments:', e);
        }
    },
    
    get() {
        try {
            const recent = localStorage.getItem('vespa_recent_establishments');
            return recent ? JSON.parse(recent) : [];
        } catch (e) {
            return [];
        }
    }
};

// Ensure this matches the initializerFunctionName in WorkingBridge.js
function initializeDashboardApp() {
    // Prevent duplicate initialization
    if (dashboardInitialized || initializationInProgress) {
        console.log("Dashboard already initialized or initialization in progress");
        return;
    }
    
    initializationInProgress = true;
    
    // Update progress
    GlobalLoader.updateProgress(10, 'Checking configuration...');
    
    // Get the configuration set by WorkingBridge.js
    const config = window.DASHBOARD_CONFIG;
    if (!config) {
        console.error("DASHBOARD_CONFIG not found. Dashboard cannot initialize.");
        GlobalLoader.hide();
        return;
    }

    console.log("Initializing Dashboard App with config:", config);
    
    // Get logged in user email from config or Knack directly
    let loggedInUserEmail = config.loggedInUserEmail;
    
    // If not in config, try to get from Knack
    if (!loggedInUserEmail && typeof Knack !== 'undefined' && Knack.getUserAttributes) {
        try {
            const userAttributes = Knack.getUserAttributes();
            loggedInUserEmail = userAttributes.email || userAttributes.values?.email;
            console.log("Got user email from Knack:", loggedInUserEmail);
        } catch (e) {
            console.error("Failed to get user email from Knack:", e);
        }
    }
    
    // If still no email, try alternative Knack method
    if (!loggedInUserEmail && typeof Knack !== 'undefined' && Knack.session && Knack.session.user) {
        try {
            loggedInUserEmail = Knack.session.user.email;
            console.log("Got user email from Knack session:", loggedInUserEmail);
        } catch (e) {
            console.error("Failed to get user email from Knack session:", e);
        }
    }
    
    const {
        knackAppId,
        knackApiKey,
        debugMode,
        sceneKey,
        viewKey,
        elementSelector,
        herokuAppUrl, // Your Heroku backend URL
        objectKeys,
        themeColors
    } = config;

    // Add Super User state variables
    let isSuperUser = false;
    let superUserRecordId = null;
    let selectedEstablishmentId = null;
    let selectedEstablishmentName = null;
    let currentAnalysisType = null; // 'school' or 'trust'
    let currentTrustName = null;
    let currentTrustSchools = [];
    
    // Track current data context
    let currentStaffAdminId = null;
    let currentEstablishmentId = null;

    // --- Helper Functions (General) ---
    function log(message, data) {
        if (debugMode) {
            console.log(`[Dashboard App] ${message}`, data === undefined ? '' : data);
        }
    }

    function errorLog(message, error) {
        console.error(`[Dashboard App ERROR] ${message}`, error);
    }

    // --- Knack API Helper ---
    // You'll need functions to fetch data from Knack.
    // These will typically use your Heroku app as a proxy to securely call the Knack API.
    // Example:
    async function fetchDataFromKnack(objectKey, filters = [], options = {}) {
        // Fast-path: if the request is for VESPA results and we already have them cached from
        // the /dashboard-initial-data batch call, return the cached set (optionally filtered)
        // instead of making a round-trip to the backend.

        if (objectKey === (objectKeys?.vespaResults || 'object_10')) {
            const cached = DataCache.get('vespaResults');
            if (cached && Array.isArray(cached)) {
                // If no server-side filters requested just return the whole set
                if (!filters || filters.length === 0) {
                    log('fetchDataFromKnack: served VESPA results from cache', { count: cached.length });
                    return cached;
                }

                // Apply simple filter logic locally so we still respect the caller's intent.
                const filtered = applyFiltersToRecords(cached, filters);
                log('fetchDataFromKnack: served filtered VESPA results from cache', { requestedFilters: filters, count: filtered.length });
                return filtered;
            }
        }

        let url = `${config.herokuAppUrl}/api/knack-data?objectKey=${objectKey}&filters=${encodeURIComponent(JSON.stringify(filters))}`;
        
        // Append options to URL if they exist
        if (options.rows_per_page) {
            url += `&rows_per_page=${options.rows_per_page}`;
        }
        if (options.sort_field) {
            url += `&sort_field=${options.sort_field}`;
        }
        if (options.sort_order) {
            url += `&sort_order=${options.sort_order}`;
        }
        if (options.fields) {
            url += `&fields=${encodeURIComponent(JSON.stringify(options.fields))}`;
        }

        // Pass through custom page cap override if provided (e.g., max_pages=0 for unlimited)
        if (options.max_pages !== undefined) {
            url += `&max_pages=${options.max_pages}`;
        }

        log("Fetching from backend URL:", url); 
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Knack API request via backend failed with status ${response.status}` }));
                throw new Error(errorData.message || `Knack API request via backend failed with status ${response.status}`);
            }
            const data = await response.json();
            return data.records; // The backend now wraps records in a 'records' key
        } catch (error) {
            errorLog(`Failed to fetch data for ${objectKey}`, error);
            throw error; // Re-throw to be handled by the caller
        }
    }
    
    // New batch data fetching function
    async function fetchDashboardInitialData(staffAdminId, establishmentId, cycle = 1) {
        // Check cache first
        const cachedData = DataCache.get('initialData');
        if (cachedData && cachedData.cycle === cycle && 
            cachedData.staffAdminId === staffAdminId && 
            cachedData.establishmentId === establishmentId) {
            log("Using cached initial data");
            return cachedData;
        }
        
        // Check if already loading
        if (DataCache.isLoading) {
            log("Data fetch already in progress, waiting...");
            // Wait for the current load to complete
            let attempts = 0;
            while (DataCache.isLoading && attempts < 50) { // Max 5 seconds wait
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            // Check cache again after waiting
            const newCachedData = DataCache.get('initialData');
            if (newCachedData && newCachedData.cycle === cycle && 
                newCachedData.staffAdminId === staffAdminId && 
                newCachedData.establishmentId === establishmentId) {
                log("Using cached data after waiting");
                return newCachedData;
            }
        }
        
        DataCache.isLoading = true;
        
        const url = `${config.herokuAppUrl}/api/dashboard-initial-data`;
        const requestData = {
            staffAdminId,
            establishmentId,
            cycle
        };
        
        log("Fetching dashboard initial data from batch endpoint:", requestData);
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Batch data request failed with status ${response.status}` }));
                throw new Error(errorData.message || `Batch data request failed with status ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache the data
            const cacheData = {
                ...data,
                cycle,
                staffAdminId,
                establishmentId
            };
            DataCache.set('initialData', cacheData);
            DataCache.set('vespaResults', data.vespaResults);
            DataCache.set('nationalBenchmark', data.nationalBenchmark);
            DataCache.set('filterOptions', data.filterOptions);
            DataCache.set('psychometricResponses', data.psychometricResponses);
            
            DataCache.isLoading = false;
            return data;
        } catch (error) {
            DataCache.isLoading = false;
            errorLog("Failed to fetch dashboard initial data", error);
            throw error;
        }
    }

    // New function to check if user is a Super User (from object_21)
    async function checkSuperUserStatus(userEmail) {
        if (!userEmail) {
            errorLog("User email not provided to checkSuperUserStatus.");
            return null;
        }

        const filters = [{
            field: 'field_86', // Assuming email field in object_21 is also field_86
            operator: 'is',
            value: userEmail
        }];

        try {
            log(`Checking Super User status for email: ${userEmail}`);
            const superUserRecords = await fetchDataFromKnack(objectKeys.superUserRoles || 'object_21', filters);
            if (superUserRecords && superUserRecords.length > 0) {
                log("Found Super User record:", superUserRecords[0]);
                return superUserRecords[0].id;
            } else {
                log("No Super User record found for email:", userEmail);
                return null;
            }
        } catch (error) {
            errorLog(`Error checking Super User status for email ${userEmail}:`, error);
            return null;
        }
    }

    // New function to get all unique establishments
    async function getAllEstablishments() {
        try {
            log("Fetching establishments from object_2 endpoint");
            
            // Use the establishments endpoint that fetches from object_2
            const url = `${config.herokuAppUrl}/api/establishments`;
            log("Fetching from establishments endpoint:", url);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch establishments: ${response.status}`);
            }
            
            const data = await response.json();
            log(`Fetched ${data.total} establishments from ${data.source_object}`);
            
            return data.establishments || [];
            
        } catch (error) {
            errorLog("Failed to fetch establishments", error);
            return [];
        }
    }

    // New function to get Staff Admin Record ID (from object_5) by User Email
    async function getStaffAdminRecordIdByEmail(userEmail) {
        if (!userEmail) {
            errorLog("User email not provided to getStaffAdminRecordIdByEmail.");
            return null;
        }
        if (!objectKeys.staffAdminRoles) {
            errorLog("staffAdminRoles object key not configured in DASHBOARD_CONFIG.objectKeys");
            return null;
        }

        const filters = [{
            field: 'field_86', // Email field in object_5 (Staff Admin Roles object)
            operator: 'is',
            value: userEmail
        }];

        try {
            log(`Fetching Staff Admin record from ${objectKeys.staffAdminRoles} for email: ${userEmail}`);
            const staffAdminRecords = await fetchDataFromKnack(objectKeys.staffAdminRoles, filters);
            if (staffAdminRecords && staffAdminRecords.length > 0) {
                if (staffAdminRecords.length > 1) {
                    log("Warning: Multiple Staff Admin records found for email:", userEmail, "Using the first one.");
                }
                log("Found Staff Admin record:", staffAdminRecords[0]);
                return staffAdminRecords[0].id; // Return the Record ID of the object_5 record
            } else {
                errorLog(`No Staff Admin record found in ${objectKeys.staffAdminRoles} for email: ${userEmail}`);
                return null;
            }
        } catch (error) {
            errorLog(`Error fetching Staff Admin record for email ${userEmail}:`, error);
            return null;
        }
    }

    // --- UI Rendering ---
    function renderDashboardUI(container, showSuperUserControls = false) {
        log("Rendering Dashboard UI into:", container);
        
        // Add styles for the filters and super user controls
        const style = document.createElement('style');
        style.textContent = `
            /* Super User Controls */
            .super-user-controls {
                background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 215, 0, 0.05));
                border: 2px solid rgba(255, 215, 0, 0.3);
                border-radius: 12px;
                padding: 20px;
                margin: 20px auto;
                max-width: 1200px;
                box-shadow: 0 4px 20px rgba(255, 215, 0, 0.2);
                animation: slideDown 0.3s ease-out;
            }
            
            .super-user-header {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 15px;
            }
            
            .super-user-badge {
                background: linear-gradient(135deg, #ffd700, #ffed4e);
                color: #0f0f23;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: 700;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-shadow: 0 2px 10px rgba(255, 215, 0, 0.4);
            }
            
            .super-user-title {
                color: #ffd700;
                font-size: 18px;
                font-weight: 600;
            }
            
            .super-user-form {
                display: flex;
                gap: 15px;
                align-items: center;
                flex-wrap: wrap;
            }
            
            .super-user-form label {
                color: #a8b2d1;
                font-weight: 600;
                font-size: 14px;
            }
            
            .super-user-form select,
            .super-user-form input {
                padding: 10px 15px;
                border: 2px solid rgba(255, 215, 0, 0.3);
                background: rgba(0, 0, 0, 0.5);
                color: #ffffff;
                border-radius: 8px;
                font-size: 14px;
                min-width: 250px;
                transition: all 0.3s ease;
            }
            
            .super-user-form select:focus,
            .super-user-form input:focus {
                outline: none;
                border-color: #ffd700;
                box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2);
            }
            
            .super-user-form button {
                padding: 10px 24px;
                background: linear-gradient(135deg, #ffd700, #ffed4e);
                color: #0f0f23;
                border: none;
                border-radius: 8px;
                font-weight: 700;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .super-user-form button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
            }
            
            .current-viewing {
                margin-top: 15px;
                padding: 10px 15px;
                background: rgba(255, 215, 0, 0.1);
                border-radius: 8px;
                color: #ffd700;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .current-viewing strong {
                color: #ffffff;
            }
            
            /* Datalist styling */
            #establishment-search-input::-webkit-calendar-picker-indicator {
                display: none;
            }
            
            #establishment-suggestions {
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 4px;
            }
            
            /* Quick Access Section */
            .quick-access-section {
                margin-bottom: 20px;
                padding: 15px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
            }
            
            .quick-access-section h4 {
                margin: 0 0 10px 0;
                color: #ffd700;
                font-size: 14px;
                font-weight: 600;
            }
            
            .quick-access-buttons {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            
            .quick-access-btn {
                padding: 8px 16px;
                background: rgba(255, 215, 0, 0.1);
                border: 1px solid rgba(255, 215, 0, 0.3);
                color: #ffffff;
                border-radius: 6px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .quick-access-btn:hover {
                background: rgba(255, 215, 0, 0.2);
                border-color: #ffd700;
                transform: translateY(-1px);
            }
            
            .filters-container {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin: 20px 0;
                padding: 20px;
                background-color: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .filter-item {
                display: flex;
                flex-direction: column;
                min-width: 150px;
                flex: 1;
            }
            
            .filter-item label {
                color: #a8b2d1;
                font-size: 12px;
                margin-bottom: 5px;
                font-weight: 600;
            }
            
            .filter-item input,
            .filter-item select {
                padding: 8px 12px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                background-color: rgba(0, 0, 0, 0.3);
                color: #ffffff;
                border-radius: 4px;
                font-size: 14px;
            }
            
            .filter-item input:focus,
            .filter-item select:focus {
                outline: none;
                border-color: #86b4f0;
                background-color: rgba(0, 0, 0, 0.5);
            }
            
            .filter-item button {
                padding: 8px 16px;
                margin-right: 10px;
                border: none;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            #apply-filters-btn {
                background-color: #86b4f0;
                color: #0f0f23;
                font-weight: 600;
            }
            
            #apply-filters-btn:hover {
                background-color: #6a9bd8;
            }
            
            #clear-filters-btn {
                background-color: rgba(255, 255, 255, 0.1);
                color: #a8b2d1;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            #clear-filters-btn:hover {
                background-color: rgba(255, 255, 255, 0.2);
            }
            
            .filter-item:last-child {
                flex-direction: row;
                align-items: flex-end;
                min-width: auto;
            }
            
            /* Analysis Type Modal */
            .analysis-type-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(10px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            }
            
            .analysis-type-modal.active {
                opacity: 1;
                visibility: visible;
            }
            
            .analysis-type-content {
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: var(--radius-lg);
                padding: 2rem;
                max-width: 500px;
                width: 90%;
                text-align: center;
                transform: scale(0.9);
                transition: transform 0.3s ease;
            }
            
            .analysis-type-modal.active .analysis-type-content {
                transform: scale(1);
            }
            
            .analysis-type-content h3 {
                color: var(--text-primary);
                font-size: 1.5rem;
                margin-bottom: 1.5rem;
            }
            
            .analysis-options {
                display: flex;
                flex-direction: column;
                gap: 1rem;
                margin: 2rem 0;
            }
            
            .analysis-option {
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 1rem;
                border: 2px solid var(--border-color);
                border-radius: var(--radius-md);
                cursor: pointer;
                transition: all 0.3s ease;
                background: rgba(255, 255, 255, 0.05);
            }
            
            .analysis-option:hover {
                border-color: var(--accent-primary);
                background: rgba(59, 130, 246, 0.1);
            }
            
            .analysis-option.selected {
                border-color: var(--accent-primary);
                background: rgba(59, 130, 246, 0.2);
            }
            
            .analysis-option input[type="radio"] {
                margin: 0;
            }
            
            .analysis-option-content {
                text-align: left;
            }
            
            .analysis-option-title {
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 0.25rem;
            }
            
            .analysis-option-desc {
                font-size: 0.9rem;
                color: var(--text-secondary);
            }
            
            .analysis-type-buttons {
                display: flex;
                gap: 1rem;
                justify-content: center;
                margin-top: 2rem;
            }
            
            .analysis-type-btn {
                padding: 0.75rem 2rem;
                border: none;
                border-radius: var(--radius-md);
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .analysis-type-btn.primary {
                background: var(--accent-primary);
                color: white;
            }
            
            .analysis-type-btn.primary:hover {
                background: var(--accent-primary-dark);
            }
            
            .analysis-type-btn.secondary {
                background: var(--card-hover-bg);
                color: var(--text-secondary);
                border: 1px solid var(--border-color);
            }
            
            .analysis-type-btn.secondary:hover {
                background: var(--border-color);
            }
            
            /* Trust Selection */
            .trust-selection {
                margin-top: 1rem;
            }
            
            .trust-dropdown {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: var(--radius-md);
                background: var(--card-bg);
                color: var(--text-primary);
                font-size: 1rem;
            }
            
            /* Trust Header */
            .trust-header {
                background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05));
                border: 2px solid rgba(16, 185, 129, 0.3);
                border-radius: 12px;
                padding: 1rem;
                margin-bottom: 1rem;
                text-align: center;
            }
            
            .trust-name {
                font-size: 1.25rem;
                font-weight: 700;
                color: var(--accent-success);
                margin-bottom: 0.5rem;
            }
            
            .trust-schools-count {
                font-size: 0.9rem;
                color: var(--text-secondary);
            }
            
            /* Trust School Filter */
            .trust-school-filter {
                margin-bottom: 1rem;
            }
            
            .trust-school-filter select {
                padding: 0.5rem;
                border: 1px solid var(--border-color);
                border-radius: var(--radius-md);
                background: var(--card-bg);
                color: var(--text-primary);
            }
            
            /* Theme Analysis Pending Styles */
            .theme-analysis-pending {
                background: rgba(255, 255, 255, 0.05);
                border: 2px dashed rgba(59, 130, 246, 0.3);
                border-radius: 12px;
                padding: 2rem;
                text-align: center;
            }
            
            .theme-analysis-pending h3 {
                color: #3b82f6;
                margin-bottom: 1rem;
                font-size: 1.25rem;
            }
            
            .config-message {
                color: #a8b2d1;
                line-height: 1.6;
            }
            
            .config-message strong {
                color: #ffffff;
            }
            
            .setup-note {
                margin-top: 1rem;
                font-size: 0.9rem;
                color: #f59e0b;
                font-style: italic;
            }
            
            /* Theme Cards Styles */
            .themes-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                gap: 1.5rem;
                margin-top: 1rem;
            }
            
            .theme-card {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 1.5rem;
                transition: all 0.3s ease;
            }
            
            .theme-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
            }
            
            .theme-card h4 {
                margin: 0 0 0.5rem 0;
                color: #ffffff;
                font-size: 1.1rem;
            }
            
            .theme-count {
                font-size: 0.9rem;
                color: #a8b2d1;
                margin-bottom: 1rem;
                font-weight: 600;
            }
            
            .theme-examples {
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding-top: 1rem;
                margin-top: 1rem;
            }
            
            .theme-examples p {
                margin: 0.5rem 0;
                font-size: 0.9rem;
                color: #e2e8f0;
                font-style: italic;
                line-height: 1.4;
            }
            
            /* Sentiment-based theme card colors */
            .theme-card.positive {
                border-color: rgba(16, 185, 129, 0.3);
                background: rgba(16, 185, 129, 0.1);
            }
            
            .theme-card.positive:hover {
                border-color: rgba(16, 185, 129, 0.5);
            }
            
            .theme-card.negative {
                border-color: rgba(239, 68, 68, 0.3);
                background: rgba(239, 68, 68, 0.1);
            }
            
            .theme-card.negative:hover {
                border-color: rgba(239, 68, 68, 0.5);
            }
            
            .theme-card.mixed {
                border-color: rgba(251, 191, 36, 0.3);
                background: rgba(251, 191, 36, 0.1);
            }
            
            .theme-card.mixed:hover {
                border-color: rgba(251, 191, 36, 0.5);
            }
            
            /* Theme Loading State */
            .themes-loading {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
            }
            
            .themes-loading h3 {
                color: #3b82f6;
                margin-bottom: 1.5rem;
            }
            
            .themes-loading .loading-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 1rem;
            }
            
            .themes-loading .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(59, 130, 246, 0.2);
                border-top: 3px solid #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            .themes-loading p {
                color: #a8b2d1;
                margin: 0;
            }
            
            .themes-loading .loading-note {
                font-size: 0.9rem;
                color: #64748b;
                font-style: italic;
            }
            
            /* Theme Keywords */
            .theme-keyword {
                display: inline-block;
                padding: 0.25rem 0.75rem;
                margin: 0.25rem;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 20px;
                font-size: 0.9rem;
                color: #e2e8f0;
            }
        `;
        document.head.appendChild(style);
        
        // Build the HTML with conditional Super User controls
        let superUserControlsHTML = '';
        if (showSuperUserControls) {
            // Get recent establishments for quick access
            const recent = RecentEstablishments.get();
            let quickAccessHTML = '';
            if (recent.length > 0) {
                quickAccessHTML = `
                    <div class="quick-access-section">
                        <h4>Quick Access - Recent Establishments</h4>
                        <div class="quick-access-buttons">
                            ${recent.map(est => `
                                <button class="quick-access-btn" data-est-id="${est.id}" data-est-name="${est.name}">
                                    ${est.name}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            superUserControlsHTML = `
                <div class="super-user-controls">
                    <div class="super-user-header">
                        <span class="super-user-badge">⚡ Super User Mode</span>
                        <span class="super-user-title">Analysis Dashboard</span>
                    </div>
                    <div class="super-user-form">
                        <button id="choose-analysis-type-btn" class="analysis-type-btn primary">
                            Choose Analysis Type
                        </button>
                    </div>
                    <div id="trust-header" class="trust-header" style="display: none;">
                        <div class="trust-name" id="current-trust-name">-</div>
                        <div class="trust-schools-count" id="current-trust-schools">-</div>
                    </div>
                    <div id="trust-school-filter" class="trust-school-filter" style="display: none;">
                        <label for="trust-school-select">Filter by School:</label>
                        <select id="trust-school-select">
                            <option value="">All Schools in Trust</option>
                        </select>
                    </div>
                    ${quickAccessHTML}
                    <div id="establishment-controls" class="super-user-form" style="display: none;">
                        <label for="establishment-select">Select Establishment:</label>
                        <select id="establishment-select">
                            <option value="">Loading establishments...</option>
                        </select>
                        <input type="text" id="establishment-search" placeholder="Search establishments..." />
                        <button id="load-establishment-btn">Load Dashboard</button>
                    </div>
                    <div id="current-establishment-viewing" class="current-viewing" style="display: none;">
                        <span>Currently viewing:</span> <strong id="current-establishment-name">-</strong>
                    </div>
                </div>
                
                <!-- Analysis Type Modal -->
                <div id="analysis-type-modal" class="analysis-type-modal">
                    <div class="analysis-type-content">
                        <h3>Choose Analysis Type</h3>
                        <div class="analysis-options">
                            <div class="analysis-option" data-type="school">
                                <input type="radio" name="analysis-type" value="school" id="analysis-school">
                                <div class="analysis-option-content">
                                    <div class="analysis-option-title">Single School Analysis</div>
                                    <div class="analysis-option-desc">Analyze data for one specific school</div>
                                </div>
                            </div>
                            <div class="analysis-option" data-type="trust">
                                <input type="radio" name="analysis-type" value="trust" id="analysis-trust">
                                <div class="analysis-option-content">
                                    <div class="analysis-option-title">Academy Trust Analysis</div>
                                    <div class="analysis-option-desc">Analyze aggregated data across multiple schools in a trust</div>
                                </div>
                            </div>
                        </div>
                        <div id="trust-selection" class="trust-selection" style="display: none;">
                            <label for="trust-dropdown">Select Academy Trust:</label>
                            <select id="trust-dropdown" class="trust-dropdown">
                                <option value="">Loading trusts...</option>
                            </select>
                        </div>
                        <div class="analysis-type-buttons">
                            <button id="analysis-continue-btn" class="analysis-type-btn primary" disabled>Continue</button>
                            <button id="analysis-cancel-btn" class="analysis-type-btn secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div id="dashboard-container">
                ${superUserControlsHTML}
                <header>
                    <h1>VESPA Performance Dashboard</h1>
                </header>
                <section id="overview-section" style="${showSuperUserControls ? 'display: none;' : ''}">
                    <h2>School Overview & Benchmarking</h2>
                    <div class="controls">
                        <div class="controls-left">
                            <label for="cycle-select">Select Cycle:</label>
                            <select id="cycle-select">
                                <option value="1">Cycle 1</option>
                                <option value="2">Cycle 2</option>
                                <option value="3">Cycle 3</option>
                            </select>
                            <div class="eri-compact-container">
                                <div class="eri-gauge-section">
                                    <div class="eri-gauge-small">
                                        <canvas id="eri-gauge-small-chart"></canvas>
                                    </div>
                                    <button class="eri-info-btn" id="eri-info-button">
                                        <span style="font-weight: bold; font-size: 14px;">i</span>
                                    </button>
                                </div>
                                <div class="eri-context-section">
                                    <div class="eri-title">Exam Readiness Index</div>
                                    <div class="eri-values">
                                        <span class="eri-school-value">School: <strong id="eri-value-display">-</strong></span>
                                        <span class="eri-national-value">Global: <strong id="eri-national-display">-</strong></span>
                                    </div>
                                    <div class="eri-interpretation" id="eri-interpretation-text">Loading...</div>
                                </div>
                            </div>
                        </div>
                        <div class="controls-right">
                            <div class="response-stats-card">
                                <div class="response-stats-content">
                                    <div class="stat-item">
                                        <span class="stat-label">Responses</span>
                                        <span class="stat-value" id="cycle-responses">-</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Total Students</span>
                                        <span class="stat-value" id="total-students">-</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Completion Rate</span>
                                        <span class="stat-value" id="completion-rate">-</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="active-filters-display" style="display:none;">
                        <div class="active-filters-header">
                            <h3>Currently Viewing:</h3>
                            <div id="active-filters-list"></div>
                        </div>
                    </div>
                    <div class="filter-toggle-container">
                        <button class="filter-toggle-btn" id="filter-toggle-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 9l-7 7-7-7"/>
                            </svg>
                            <span>Filters</span>
                        </button>
                    </div>
                    <div class="filters-container" id="filters-container">
                        <div class="filter-item">
                            <label for="student-search">Student:</label>
                            <input type="text" id="student-search" placeholder="Search by name..." />
                        </div>
                        <div class="filter-item">
                            <label for="group-filter">Group:</label>
                            <select id="group-filter">
                                <option value="">All Groups</option>
                            </select>
                        </div>
                        <div class="filter-item">
                            <label for="course-filter">Course:</label>
                            <select id="course-filter">
                                <option value="">All Courses</option>
                            </select>
                        </div>
                        <div class="filter-item">
                            <label for="year-group-filter">Year Group:</label>
                            <select id="year-group-filter">
                                <option value="">All Year Groups</option>
                            </select>
                        </div>
                        <div class="filter-item">
                            <label for="faculty-filter">Faculty:</label>
                            <select id="faculty-filter">
                                <option value="">All Faculties</option>
                            </select>
                        </div>
                        <div class="filter-item">
                            <button id="apply-filters-btn">Apply Filters</button>
                            <button id="clear-filters-btn">Clear Filters</button>
                        </div>
                    </div>
                   <div id="loading-indicator" style="display:none;">
                        <p>Loading chart data...</p>
                        <div class="spinner"></div>
                    </div>
                    <div class="dashboard-content-wrapper">
                        <div id="vespa-combined-container" class="vespa-combined-grid">
                            <!-- Score cards and charts will be dynamically inserted here in alternating pattern -->
                        </div>
                    </div>
                </section>
                <section id="qla-section" style="${showSuperUserControls ? 'display: none;' : ''}">
                    <h2>Question Level Analysis</h2>
                    <div id="qla-top-bottom-questions">
                        <!-- Top and bottom questions will be rendered here -->
                    </div>
                    <div class="qla-insights-header">
                        <h3>VESPA Questionnaire Insights</h3>
                        <button class="qla-insights-info-btn" onclick="window.showQLAInsightsInfoModal()">
                            <span style="font-weight: bold; font-size: 14px;">i</span>
                        </button>
                    </div>
                    <div id="qla-insights-grid" class="qla-insights-grid">
                        <!-- Pre-calculated insights will be rendered here -->
                    </div>
                </section>
                <section id="student-insights-section" style="${showSuperUserControls ? 'display: none;' : ''}">
                    <h2>Student Comment Insights</h2>
                    <div id="word-cloud-container"></div>
                    <div id="common-themes-container"></div>
                </section>
            </div>
        `;
        
        // Add print report button after dashboard is rendered
        addPrintReportButton();
        
        // Add event listeners for UI elements
        
        // Add filter toggle functionality
        const filterToggleBtn = document.getElementById('filter-toggle-btn');
        const filtersContainer = document.getElementById('filters-container');
        if (filterToggleBtn && filtersContainer) {
            filterToggleBtn.addEventListener('click', () => {
                const isCollapsed = filtersContainer.classList.contains('collapsed');
                if (isCollapsed) {
                    filtersContainer.classList.remove('collapsed');
                    filterToggleBtn.classList.remove('collapsed');
                } else {
                    filtersContainer.classList.add('collapsed');
                    filterToggleBtn.classList.add('collapsed');
                }
            });
        }
        
        // Add ERI info button event listener
        const eriInfoBtn = document.getElementById('eri-info-button');
        if (eriInfoBtn) {
            eriInfoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.showERIInfoModal();
            });
        }
        
        // Add Super User specific event listeners
        if (showSuperUserControls) {
            const establishmentSelect = document.getElementById('establishment-select');
            const establishmentSearch = document.getElementById('establishment-search');
            const loadEstablishmentBtn = document.getElementById('load-establishment-btn');
            const chooseAnalysisBtn = document.getElementById('choose-analysis-type-btn');
            
            // Analysis type modal listeners
            if (chooseAnalysisBtn) {
                chooseAnalysisBtn.addEventListener('click', showAnalysisTypeModal);
            }
            
            if (loadEstablishmentBtn) {
                loadEstablishmentBtn.addEventListener('click', handleEstablishmentLoad);
            }
            
            if (establishmentSearch) {
                establishmentSearch.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    filterEstablishmentDropdown(searchTerm);
                });
            }
            
            // Add quick access button listeners
            document.querySelectorAll('.quick-access-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const estId = e.target.dataset.estId;
                    const estName = e.target.dataset.estName;
                    
                    // Set the dropdown value
                    if (establishmentSelect) {
                        establishmentSelect.value = estId;
                    }
                    
                    // Load the dashboard for this establishment
                    selectedEstablishmentId = estId;
                    selectedEstablishmentName = estName;
                    
                    log(`Quick loading dashboard for establishment: ${estName} (${estId})`);
                    
                    // Update the current viewing display
                    const currentViewingDiv = document.getElementById('current-establishment-viewing');
                    const currentNameSpan = document.getElementById('current-establishment-name');
                    if (currentViewingDiv) currentViewingDiv.style.display = 'flex';
                    if (currentNameSpan) currentNameSpan.textContent = estName;
                    
                    // Show all sections
                    document.getElementById('overview-section').style.display = 'block';
                    document.getElementById('qla-section').style.display = 'block';
                    document.getElementById('student-insights-section').style.display = 'block';
                    
                    // Clear any existing cache to ensure fresh data
                    DataCache.clear();
                    
                    // Load data with establishment filter
                    await loadDashboardWithEstablishment(estId, estName);
                });
            });
            
            // Load establishments
            loadEstablishmentsDropdown();
        }
    }
    
    // === ANALYSIS TYPE MODAL FUNCTIONS ===
    
    // Analysis Type Modal Functions
    function showAnalysisTypeModal() {
        const modal = document.getElementById('analysis-type-modal');
        if (modal) {
            modal.classList.add('active');
            loadTrustsDropdown(); // Load trusts when modal opens
            
            // Ensure event listeners are set up when modal is shown
            setTimeout(() => {
                setupAnalysisTypeModal();
            }, 50);
        }
    }
    
    function hideAnalysisTypeModal() {
        log('hideAnalysisTypeModal called');
        const modal = document.getElementById('analysis-type-modal');
        if (modal) {
            modal.classList.remove('active');
            log('Modal hidden');
        } else {
            log('Modal not found when trying to hide');
        }
    }
    
    function setupAnalysisTypeModal() {
        // Use a timeout to ensure DOM elements are ready
        setTimeout(() => {
            const modal = document.getElementById('analysis-type-modal');
            const continueBtn = document.getElementById('analysis-continue-btn');
            const cancelBtn = document.getElementById('analysis-cancel-btn');
            const trustSelection = document.getElementById('trust-selection');
            
            // Check if elements exist before adding listeners
            if (!modal || !continueBtn || !cancelBtn) {
                log('Analysis type modal elements not found, retrying...');
                // Retry after a longer delay
                setTimeout(setupAnalysisTypeModal, 500);
                return;
            }
            
            // Check if already set up to prevent duplicate listeners
            if (modal.dataset.setupComplete === 'true') {
                log('Analysis type modal already set up, skipping...');
                return;
            }
            
            log('Setting up analysis type modal event listeners');
            
            // For debugging - temporarily enable the continue button
            if (continueBtn) {
                log('Continue button found, current state:', {
                    disabled: continueBtn.disabled,
                    display: continueBtn.style.display,
                    opacity: continueBtn.style.opacity
                });
                
                // TEMPORARY: Enable button for testing
                continueBtn.disabled = false;
                continueBtn.style.opacity = '1';
                continueBtn.style.cursor = 'pointer';
                log('TEMPORARY: Continue button enabled for testing');
            }
            
            // Radio button change handlers using event delegation
            modal.addEventListener('change', (e) => {
                if (e.target.name === 'analysis-type') {
                    const selectedType = e.target.value;
                    log('Radio button changed to:', selectedType);
                    
                    // Update option styling
                    document.querySelectorAll('.analysis-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    e.target.closest('.analysis-option').classList.add('selected');
                    
                    // Show/hide trust selection
                    if (trustSelection) {
                        if (selectedType === 'trust') {
                            trustSelection.style.display = 'block';
                        } else {
                            trustSelection.style.display = 'none';
                        }
                    }
                    
                    // Enable continue button
                    if (continueBtn) {
                        continueBtn.disabled = false;
                        continueBtn.style.opacity = '1';
                        continueBtn.style.cursor = 'pointer';
                        log('Continue button enabled');
                    }
                }
            });
            
            // Also add click handlers to the analysis options for better UX
            document.querySelectorAll('.analysis-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    log('Analysis option clicked:', option.dataset.type);
                    
                    // Don't trigger if clicking directly on the radio button
                    if (e.target.type === 'radio') return;
                    
                    const radio = option.querySelector('input[type="radio"]');
                    if (radio) {
                        log('Setting radio button checked:', radio.value);
                        radio.checked = true;
                        
                        // Manually trigger change event
                        const changeEvent = new Event('change', { bubbles: true });
                        radio.dispatchEvent(changeEvent);
                        log('Change event dispatched');
                    }
                });
            });
            
            // Also add direct click handlers to radio buttons
            document.querySelectorAll('input[name="analysis-type"]').forEach(radio => {
                radio.addEventListener('click', (e) => {
                    log('Radio button directly clicked:', e.target.value);
                    
                    // Manually trigger change event to ensure it fires
                    const changeEvent = new Event('change', { bubbles: true });
                    e.target.dispatchEvent(changeEvent);
                });
            });
            
            // Trust dropdown change handler
            const trustDropdown = document.getElementById('trust-dropdown');
            if (trustDropdown) {
                trustDropdown.addEventListener('change', (e) => {
                    // Enable continue button when trust is selected
                    const selectedType = document.querySelector('input[name="analysis-type"]:checked')?.value;
                    if (continueBtn) {
                        continueBtn.disabled = !(selectedType === 'school' || (selectedType === 'trust' && e.target.value));
                    }
                });
            }
            
            // Continue button handler
            continueBtn.addEventListener('click', (e) => {
                log('Continue button clicked, disabled state:', continueBtn.disabled);
                e.preventDefault();
                e.stopPropagation();
                
                // Check if an analysis type is selected
                const selectedType = document.querySelector('input[name="analysis-type"]:checked');
                if (!selectedType) {
                    log('No analysis type selected');
                    alert('Please select an analysis type first');
                    return;
                }
                
                log('Analysis type selected:', selectedType.value);
                handleAnalysisTypeContinue();
            });
            
            // Cancel button handler
            cancelBtn.addEventListener('click', (e) => {
                log('Cancel button clicked');
                e.preventDefault();
                hideAnalysisTypeModal();
            });
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideAnalysisTypeModal();
                }
            });
            
            // Mark as set up to prevent duplicate listeners
            modal.dataset.setupComplete = 'true';
            
            log('Analysis type modal event listeners set up successfully');
        }, 100);
    }
    
    async function handleAnalysisTypeContinue() {
        log('handleAnalysisTypeContinue called');
        
        const selectedType = document.querySelector('input[name="analysis-type"]:checked')?.value;
        log('Selected analysis type:', selectedType);
        
        if (!selectedType) {
            alert('Please select an analysis type');
            return;
        }
        
        currentAnalysisType = selectedType;
        
        if (selectedType === 'school') {
            // Show school selection controls
            document.getElementById('establishment-controls').style.display = 'flex';
            document.getElementById('trust-header').style.display = 'none';
            document.getElementById('trust-school-filter').style.display = 'none';
            
            // Load establishments if not already loaded
            await loadEstablishmentsDropdown();
            
        } else if (selectedType === 'trust') {
            const trustDropdown = document.getElementById('trust-dropdown');
            const selectedTrustValue = trustDropdown.value;
            
            if (!selectedTrustValue) {
                alert('Please select an Academy Trust');
                return;
            }
            
            // Parse trust data
            const trustData = JSON.parse(selectedTrustValue);
            currentTrustName = trustData.name;
            
            // Show trust header and hide school controls
            document.getElementById('trust-header').style.display = 'block';
            document.getElementById('current-trust-name').textContent = currentTrustName;
            document.getElementById('establishment-controls').style.display = 'none';
            
            // Load trust schools and show trust-specific filter
            await loadTrustSchools(trustData.id);
        }
        
        hideAnalysisTypeModal();
        
        // Show dashboard sections
        document.getElementById('overview-section').style.display = 'block';
        document.getElementById('qla-section').style.display = 'block';
        document.getElementById('student-insights-section').style.display = 'block';
        
        // Load initial data
        if (selectedType === 'trust') {
            await loadTrustDashboard();
        }
    }
    
    async function loadTrustsDropdown() {
        const trustDropdown = document.getElementById('trust-dropdown');
        if (!trustDropdown) {
            log('Trust dropdown not found');
            return;
        }
        
        try {
            log("Loading Academy Trusts from backend...");
            trustDropdown.innerHTML = '<option value="">Loading trusts...</option>';
            
            // Try to use the dedicated academy trusts endpoint first
            try {
                const trustResponse = await fetch(`${config.herokuAppUrl}/api/academy-trusts`);
                if (trustResponse.ok) {
                    const trustData = await trustResponse.json();
                    log(`Fetched ${trustData.trusts.length} trusts from academy-trusts endpoint`);
                    
                    if (trustData.trusts && trustData.trusts.length > 0) {
                        // Clear and populate dropdown with real trust data
                        trustDropdown.innerHTML = '<option value="">Select Academy Trust...</option>';
                        
                        trustData.trusts.forEach(trust => {
                            const option = document.createElement('option');
                            option.value = JSON.stringify(trust);
                            option.textContent = `${trust.name} (${trust.schools.length} schools)`;
                            trustDropdown.appendChild(option);
                        });
                        
                        log(`Successfully loaded ${trustData.trusts.length} Academy Trusts from API`);
                        return;
                    } else {
                        log('No trusts found in API response, falling back to manual parsing');
                    }
                } else {
                    log(`Academy trusts API returned status ${trustResponse.status}, falling back to manual parsing`);
                }
            } catch (apiError) {
                log('Academy trusts API error, falling back to manual parsing:', apiError.message);
            }
            
            // Fallback: Get all establishments and extract trust information manually
            log("Fetching establishments to manually extract Academy Trust data...");
            const establishments = await getAllEstablishments();
            log(`Fetched ${establishments.length} establishments for manual trust analysis`);
            
            if (establishments.length === 0) {
                trustDropdown.innerHTML = '<option value="">No establishments available</option>';
                return;
            }
            
            // Extract unique trust names from establishments using field_3480
            const trustMap = new Map();
            let establishmentsWithTrusts = 0;
            
            establishments.forEach(est => {
                // Use field_3480 (Academy Trust field in Object_2)
                const trustName = est.field_3480_raw || est.field_3480;
                
                if (trustName && trustName.trim() && 
                    trustName.toLowerCase() !== 'null' && 
                    trustName.toLowerCase() !== 'undefined' &&
                    trustName.toLowerCase() !== '') {
                    
                    const normalizedName = trustName.trim();
                    establishmentsWithTrusts++;
                    
                    if (!trustMap.has(normalizedName)) {
                        trustMap.set(normalizedName, {
                            id: normalizedName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                            name: normalizedName,
                            trustFieldValue: normalizedName, // Store the exact field value for filtering
                            schools: []
                        });
                    }
                    trustMap.get(normalizedName).schools.push({
                        id: est.id,
                        name: est.name || est.field_44 || est.field_44_raw || `School ${est.id}`,
                        status: est.status || est.field_2209 || 'Active',
                        establishmentId: est.id
                    });
                }
            });
            
            log(`Found ${establishmentsWithTrusts} establishments with Academy Trust data out of ${establishments.length} total`);
            
            // Clear and populate dropdown
            trustDropdown.innerHTML = '<option value="">Select Academy Trust...</option>';
            
            if (trustMap.size > 0) {
                // Sort trusts alphabetically
                const sortedTrusts = Array.from(trustMap.values()).sort((a, b) => a.name.localeCompare(b.name));
                
                sortedTrusts.forEach(trust => {
                    const option = document.createElement('option');
                    option.value = JSON.stringify(trust);
                    option.textContent = `${trust.name} (${trust.schools.length} schools)`;
                    trustDropdown.appendChild(option);
                });
                
                log(`Successfully loaded ${trustMap.size} Academy Trusts from establishment data`);
            } else {
                // No trust data found at all
                log('No Academy Trust data found in any establishments');
                trustDropdown.innerHTML = '<option value="">No Academy Trusts found - Please ensure field_3480 is populated</option>';
            }
            
        } catch (error) {
            errorLog('Failed to load Academy Trusts', error);
            trustDropdown.innerHTML = '<option value="">Error loading Academy Trusts - Please refresh</option>';
        }
    }
    
    async function loadTrustSchools(trustId) {
        const trustSchoolSelect = document.getElementById('trust-school-select');
        const trustSchoolsCount = document.getElementById('current-trust-schools');
        
        try {
            // Get trust data from the dropdown
            const trustDropdown = document.getElementById('trust-dropdown');
            const trustData = JSON.parse(trustDropdown.value);
            currentTrustSchools = trustData.schools;
            
            // Update schools count
            trustSchoolsCount.textContent = `${currentTrustSchools.length} schools`;
            
            // Populate school filter dropdown
            trustSchoolSelect.innerHTML = '<option value="">All Schools in Trust</option>';
            
            currentTrustSchools.forEach(school => {
                const option = document.createElement('option');
                option.value = school.id;
                option.textContent = school.name;
                trustSchoolSelect.appendChild(option);
            });
            
            // Show the school filter
            document.getElementById('trust-school-filter').style.display = 'block';
            
            // Add event listener for school filter changes
            trustSchoolSelect.addEventListener('change', async (e) => {
                const selectedSchoolId = e.target.value;
                if (selectedSchoolId) {
                    // Filter to specific school within trust
                    const selectedSchool = currentTrustSchools.find(s => s.id === selectedSchoolId);
                    if (selectedSchool) {
                        await loadDashboardWithEstablishment(selectedSchool.id, selectedSchool.name);
                    }
                } else {
                    // Show all schools in trust
                    await loadTrustDashboard();
                }
            });
            
            log(`Loaded ${currentTrustSchools.length} schools for trust`);
            
        } catch (error) {
            errorLog('Failed to load trust schools', error);
        }
    }
    
    async function loadTrustDashboard() {
        if (!currentTrustSchools || currentTrustSchools.length === 0) {
            errorLog('No trust schools available');
            return;
        }
        
        log(`Loading dashboard for trust: ${currentTrustName} with ${currentTrustSchools.length} schools`);
        
        // Show global loader
        GlobalLoader.init();
        GlobalLoader.updateProgress(10, `Loading trust data for ${currentTrustName}...`);
        
        try {
            // Get current cycle
            const cycleSelectElement = document.getElementById('cycle-select');
            const currentCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
            
            // Extract school IDs for the trust
            const schoolIds = currentTrustSchools.map(school => school.id);
            log(`Fetching aggregated data for ${schoolIds.length} schools: ${schoolIds.join(', ')}`);
            
            GlobalLoader.updateProgress(30, 'Fetching trust data from backend...');
            
            // Get the trust field value for filtering
            const trustDropdown = document.getElementById('trust-dropdown');
            const trustData = JSON.parse(trustDropdown.value);
            const trustFieldValue = trustData.trustFieldValue || trustData.name;
            
            // Use the dedicated trust dashboard endpoint
            try {
                const requestBody = {
                    trustName: currentTrustName,
                    trustFieldValue: trustFieldValue, // Send the exact field value for filtering
                    schoolIds: schoolIds,
                    cycle: currentCycle
                };
                
                log('Trust dashboard request body:', requestBody);
                
                const trustResponse = await fetch(`${config.herokuAppUrl}/api/dashboard-trust-data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });
                
                log('Trust dashboard response status:', trustResponse.status);
                
                if (trustResponse.ok) {
                    const trustData = await trustResponse.json();
                    log(`Received aggregated trust data: ${trustData.totalRecords} total records across ${trustData.schoolCount} schools`);
                    
                    GlobalLoader.updateProgress(50, 'Processing trust data...');
                    
                    // Cache the trust data
                    DataCache.set('vespaResults', trustData.vespaResults);
                    DataCache.set('nationalBenchmark', trustData.nationalBenchmark);
                    DataCache.set('filterOptions', trustData.filterOptions);
                    
                    // Store trust schools for filtering
                    currentTrustSchools = trustData.trustSchools || [];
                    
                    // Populate filter dropdowns from trust data
                    populateFilterDropdownsFromCache(trustData.filterOptions);
                    
                    // Set up trust school filter
                    setupTrustSchoolFilter();
                    
                    GlobalLoader.updateProgress(70, 'Rendering trust dashboard...');
                    
                    // Load dashboard sections with trust data - pass the whole trustData object
                    await loadOverviewData(null, currentCycle, [], null, trustData);
                    
                    // Store trust-wide averages for comparison
                    DataCache.trustAverages = calculateSchoolVespaAverages(trustData.vespaResults, currentCycle);
                    log("Stored trust-wide averages for comparison:", DataCache.trustAverages);
                    
                    GlobalLoader.updateProgress(80, 'Loading trust insights...');
                    
                    // Load QLA and insights for the trust, passing the trust identifier
                    const trustIdentifier = { trustFieldValue: trustFieldValue };
                    await Promise.all([
                        loadQLAData(null, null, trustIdentifier),
                        loadStudentCommentInsights(null, null, trustIdentifier)
                    ]);
                    
                    // Add trust analysis note
                    addTrustAnalysisNote();
                    
                    // Update trust header with school count
                    updateTrustHeader();
                    
                    GlobalLoader.updateProgress(100, 'Trust dashboard ready!');
                    setTimeout(() => GlobalLoader.hide(), 500);
                    
                    return;
                } else {
                    const errorText = await trustResponse.text();
                    log('Trust dashboard response error:', trustResponse.status, errorText);
                }
            } catch (trustApiError) {
                errorLog('Trust API error, falling back to individual school aggregation:', trustApiError);
            }
            
            // Fallback: Aggregate data from individual schools
            GlobalLoader.updateProgress(40, 'Aggregating data from individual schools...');
            log('Using fallback method: aggregating individual school data');
            
            // Clear any existing cache
            DataCache.clear();
            
            // For now, load the largest school in the trust as a representative sample
            // In the future, we could aggregate all schools, but this might be slow
            let largestSchool = currentTrustSchools[0];
            
            // If we have multiple schools, try to find the one with the most data
            if (currentTrustSchools.length > 1) {
                // For simplicity, just use the first school for now
                // In a full implementation, we'd fetch record counts for each school
                largestSchool = currentTrustSchools[0];
            }
            
            log(`Loading representative data from: ${largestSchool.name}`);
            
            // Load data for the representative school
            await loadDashboardWithEstablishment(largestSchool.id, `${currentTrustName} (Trust Analysis)`);
            
            // Add trust analysis note
            addTrustAnalysisNote();
            
        } catch (error) {
            errorLog('Failed to load trust dashboard', error);
            GlobalLoader.hide();
            
            // Show error message
            const errorHtml = `
                <div style="padding: 2rem; text-align: center;">
                    <h3 style="color: var(--accent-danger);">Unable to Load Trust Dashboard</h3>
                    <p style="margin: 1rem 0;">Failed to load data for ${currentTrustName}. Please try again or contact support.</p>
                    <button onclick="location.reload()" style="padding: 0.5rem 1rem; background: var(--accent-primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Refresh Page
                    </button>
                </div>
            `;
            
            document.getElementById('overview-section').innerHTML = errorHtml;
        }
    }
    
    // Helper function to add trust analysis note
    function addTrustAnalysisNote(schoolName = null) {
        const overviewSection = document.getElementById('overview-section');
        if (overviewSection) {
            const existingNote = overviewSection.querySelector('.trust-analysis-note');
            if (existingNote) {
                // Remove the existing note before adding a new one to prevent duplicates
                existingNote.remove();
            }
            const note = document.createElement('div');
            note.className = 'trust-analysis-note';
            note.style.cssText = `
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: 8px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    color: #10b981;
                    text-align: center;
                `;
            
            if (schoolName) {
                 note.innerHTML = `
                    <strong>Trust-wide Analysis</strong><br>
                    Viewing <strong>${schoolName}</strong> (compared against ${currentTrustName})
                `;
            } else {
                note.innerHTML = `
                    <strong>Trust-wide Analysis</strong><br>
                    Showing aggregated data for ${currentTrustName} (${currentTrustSchools.length} schools)
                `;
            }
            overviewSection.insertBefore(note, overviewSection.firstChild.nextSibling);
        }
    }
    
    // Helper function to set up trust school filter
    function setupTrustSchoolFilter() {
        const trustSchoolSelect = document.getElementById('trust-school-select');
        if (!trustSchoolSelect || !currentTrustSchools) return;
        
        // Clear and populate school filter dropdown
        trustSchoolSelect.innerHTML = '<option value="">All Schools in Trust</option>';
        
        currentTrustSchools.forEach(school => {
            const option = document.createElement('option');
            option.value = school.id;
            option.textContent = school.name;
            trustSchoolSelect.appendChild(option);
        });
        
        // Show the school filter
        document.getElementById('trust-school-filter').style.display = 'block';
        
        // Remove any existing event listeners and add new one
        const newSelect = trustSchoolSelect.cloneNode(true);
        trustSchoolSelect.parentNode.replaceChild(newSelect, trustSchoolSelect);
        
        newSelect.addEventListener('change', async (e) => {
            const selectedSchoolId = e.target.value;
            if (selectedSchoolId) {
                // Filter to specific school within trust
                const selectedSchool = currentTrustSchools.find(s => s.id === selectedSchoolId);
                if (selectedSchool) {
                    log(`Filtering trust data to show only: ${selectedSchool.name}`);
                    await loadSchoolInTrustView(selectedSchool.id, selectedSchool.name);
                }
            } else {
                // Show all schools in trust
                log('Showing all schools in trust');
                await loadTrustDashboard();
            }
        });
        
        log(`Set up trust school filter with ${currentTrustSchools.length} schools`);
    }
    
    async function loadSchoolInTrustView(schoolId, schoolName) {
        log(`Loading school-in-trust view for: ${schoolName} (${schoolId})`);
        
        // Show global loader
        GlobalLoader.init();
        GlobalLoader.updateProgress(10, `Loading data for ${schoolName}...`);
        
        try {
            // Fetch data for the specific school
            const cycleSelectElement = document.getElementById('cycle-select');
            const currentCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
            
            // Re-use the batch data fetching for a single establishment
            const batchData = await fetchDashboardInitialData(null, schoolId, currentCycle);
            
            // We have the school's data, now render it against the cached trust data
            const schoolAverages = calculateSchoolVespaAverages(batchData.vespaResults, currentCycle);
            const trustAverages = DataCache.trustAverages; // Use the cached trust averages
            
            log("School Averages:", schoolAverages);
            log("Trust Averages (for comparison):", trustAverages);
            
            // Render the charts with a custom comparison label
            renderAveragesChart(schoolAverages, trustAverages, currentCycle, 'Trust Avg');
            renderDistributionCharts(batchData.vespaResults, trustAverages, themeColors, currentCycle, null, 'Trust Avg'); // Pass trust averages as comparison
            
            // Update other sections for the single school
            await loadQLAData(null, schoolId);
            await loadStudentCommentInsights(null, schoolId);
            
            // Update the analysis note
            addTrustAnalysisNote(schoolName);
            
            GlobalLoader.updateProgress(100, 'School view ready!');
            setTimeout(() => GlobalLoader.hide(), 500);
            
        } catch (error) {
            errorLog('Failed to load school-in-trust view', error);
            GlobalLoader.hide();
        }
    }
    
    // Helper function to update trust header
    function updateTrustHeader() {
        const trustNameElement = document.getElementById('current-trust-name');
        const trustSchoolsElement = document.getElementById('current-trust-schools');
        
        if (trustNameElement) {
            trustNameElement.textContent = currentTrustName;
        }
        
        if (trustSchoolsElement && currentTrustSchools) {
            trustSchoolsElement.textContent = `${currentTrustSchools.length} schools`;
        }
        
        // Show the trust header
        const trustHeader = document.getElementById('trust-header');
        if (trustHeader) {
            trustHeader.style.display = 'block';
        }
    }
    
    // New function to handle establishment selection and loading
    async function handleEstablishmentLoad() {
        const establishmentSelect = document.getElementById('establishment-select');
        const selectedOption = establishmentSelect.selectedOptions[0];
        
        if (!establishmentSelect.value) {
            alert('Please select an establishment first.');
            return;
        }
        
        selectedEstablishmentId = establishmentSelect.value;
        selectedEstablishmentName = selectedOption.textContent;
        
        log(`Loading dashboard for establishment: ${selectedEstablishmentName} (${selectedEstablishmentId})`);
        
        // Add to recent establishments
        RecentEstablishments.add(selectedEstablishmentId, selectedEstablishmentName);
        
        // Update the current viewing display
        const currentViewingDiv = document.getElementById('current-establishment-viewing');
        const currentNameSpan = document.getElementById('current-establishment-name');
        if (currentViewingDiv) currentViewingDiv.style.display = 'flex';
        if (currentNameSpan) currentNameSpan.textContent = selectedEstablishmentName;
        
        // Show all sections
        document.getElementById('overview-section').style.display = 'block';
        document.getElementById('qla-section').style.display = 'block';
        document.getElementById('student-insights-section').style.display = 'block';
        
        // Clear any existing cache to ensure fresh data
        DataCache.clear();
        
        // Load data with establishment filter
        await loadDashboardWithEstablishment(selectedEstablishmentId, selectedEstablishmentName);
    }
    
    // New function to load establishments dropdown
    async function loadEstablishmentsDropdown() {
        const establishmentSelect = document.getElementById('establishment-select');
        if (!establishmentSelect) return;
        
        establishmentSelect.innerHTML = '<option value="">Loading VESPA Customers...</option>';
        establishmentSelect.disabled = true; // Disable during loading
        
        try {
            // Trigger pre-caching in the background
            fetch(`${config.herokuAppUrl}/api/establishments?precache=true`).catch(err => {
                log("Failed to trigger pre-caching:", err);
            });
            
            const establishments = await getAllEstablishments();
            
            if (establishments.length === 0) {
                establishmentSelect.innerHTML = '<option value="">No active VESPA Customers found</option>';
                log("No establishments found");
                return;
            }
            
            establishmentSelect.innerHTML = '<option value="">Select a VESPA Customer...</option>';
            establishments.forEach(est => {
                const option = document.createElement('option');
                option.value = est.id;
                option.textContent = est.name;
                // Add data attribute for status if available
                if (est.status) {
                    option.setAttribute('data-status', est.status);
                }
                establishmentSelect.appendChild(option);
            });
            
            establishmentSelect.disabled = false; // Re-enable after loading
            log(`Loaded ${establishments.length} VESPA Customers in dropdown`);
            
        } catch (error) {
            errorLog("Failed to load establishments", error);
            establishmentSelect.innerHTML = '<option value="">Error loading VESPA Customers - Please refresh</option>';
            establishmentSelect.disabled = false;
        }
    }
    
    // New function to filter establishment dropdown
    function filterEstablishmentDropdown(searchTerm) {
        const establishmentSelect = document.getElementById('establishment-select');
        if (!establishmentSelect) return;
        
        const options = establishmentSelect.querySelectorAll('option');
        options.forEach(option => {
            if (option.value === '') return; // Keep the placeholder
            
            const text = option.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        });
    }
    
    // New function to filter establishment dropdown
    function filterEstablishmentDropdown(searchTerm) {
        const establishmentSelect = document.getElementById('establishment-select');
        if (!establishmentSelect) return;
        
        const options = establishmentSelect.querySelectorAll('option');
        options.forEach(option => {
            if (option.value === '') return; // Keep the placeholder
            
            const text = option.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        });
    }
    
    // New function to load dashboard with establishment filter
    async function loadDashboardWithEstablishment(establishmentId, establishmentName) {
        log(`Loading dashboard data for VESPA Customer: ${establishmentName} (${establishmentId})`);
        
        // Show global loader
        GlobalLoader.init();
        GlobalLoader.updateProgress(10, `Loading data for ${establishmentName}...`);
        
        // Update current context
        currentEstablishmentId = establishmentId;
        
        try {
            // Load initial data
            const cycleSelectElement = document.getElementById('cycle-select');
            const initialCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
            
            // Fetch the dashboard data with better error handling
            GlobalLoader.updateProgress(30, 'Fetching dashboard data...');
            
            try {
                // Pass null for staffAdminId since we're in Super User mode
                const batchData = await fetchDashboardInitialData(null, establishmentId, initialCycle);
                
                // Check if we're in limited mode
                if (batchData.isLimitedMode) {
                    log(`Limited mode active: ${batchData.loadedRecords} of ${batchData.totalRecords} records loaded`);
                    GlobalLoader.updateProgress(40, `Loading limited dataset (${batchData.loadedRecords} records)...`);
                }
                
                // Populate filter dropdowns from cached data
                GlobalLoader.updateProgress(50, 'Setting up filters...');
                populateFilterDropdownsFromCache(batchData.filterOptions);
                
                // Load all sections with cached data
                GlobalLoader.updateProgress(70, 'Rendering visualizations...');
                
                // Load sections sequentially to avoid overwhelming the browser
                await loadOverviewData(null, initialCycle, [], establishmentId);
                GlobalLoader.updateProgress(80, 'Loading question analysis...');
                
                await loadQLAData(null, establishmentId);
                GlobalLoader.updateProgress(85, 'Loading student insights...');
                
                await loadStudentCommentInsights(null, establishmentId);
                GlobalLoader.updateProgress(90, 'Finalizing...');
                
                // Add print report button after dashboard loads
                addPrintReportButton();
                
            } catch (fetchError) {
                // If the initial fetch fails, show a more helpful error message
                errorLog("Failed to fetch dashboard data", fetchError);
                
                // Check if it's a timeout error
                if (fetchError.message.includes('timeout') || fetchError.message.includes('503')) {
                    throw new Error(`The dataset for ${establishmentName} is too large to load quickly. Please try selecting a smaller establishment or contact support for assistance.`);
                } else {
                    throw fetchError;
                }
            }
            
            // Update event listeners to use establishment filter
            if (cycleSelectElement) {
                // Remove old listeners
                const newCycleSelect = cycleSelectElement.cloneNode(true);
                cycleSelectElement.parentNode.replaceChild(newCycleSelect, cycleSelectElement);
                
                newCycleSelect.addEventListener('change', async (event) => {
                    const selectedCycle = parseInt(event.target.value, 10);
                    log(`Cycle changed to: ${selectedCycle}`);
                    
                    // Clear cache to force refresh for new cycle
                    DataCache.clear();
                    
                    const activeFilters = getActiveFilters();
                    
                    // Reload all dashboard sections, not just overview
                    await loadDashboardWithEstablishment(establishmentId, establishmentName, selectedCycle, activeFilters);
                });
            }
            
            GlobalLoader.updateProgress(100, 'Dashboard ready!');
            setTimeout(() => GlobalLoader.hide(), 500);
            
        } catch (error) {
            errorLog("Failed to load establishment dashboard", error);
            GlobalLoader.hide();
            
            // Show user-friendly error messages
            const errorMessage = error.message || 'An unexpected error occurred';
            const errorHtml = `
                <div style="padding: 2rem; text-align: center;">
                    <h3 style="color: var(--accent-danger);">Unable to Load Dashboard</h3>
                    <p style="margin: 1rem 0;">${errorMessage}</p>
                    <button onclick="location.reload()" style="padding: 0.5rem 1rem; background: var(--accent-primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Refresh Page
                    </button>
                </div>
            `;
            
            document.getElementById('overview-section').innerHTML = errorHtml;
            document.getElementById('qla-section').innerHTML = '';
            document.getElementById('student-insights-section').innerHTML = '';
        }
        
        // Update filter buttons
        const applyFiltersBtn = document.getElementById('apply-filters-btn');
        if (applyFiltersBtn) {
            const newApplyBtn = applyFiltersBtn.cloneNode(true);
            applyFiltersBtn.parentNode.replaceChild(newApplyBtn, applyFiltersBtn);
            
            newApplyBtn.addEventListener('click', () => {
                const selectedCycle = document.getElementById('cycle-select') ? 
                    parseInt(document.getElementById('cycle-select').value, 10) : 1;
                const activeFilters = getActiveFilters();
                log("Applying filters:", activeFilters);

                if (currentAnalysisType === 'trust') {
                    const selectedSchoolId = document.getElementById('trust-school-select')?.value;
                    if (selectedSchoolId) {
                        const schoolName = document.getElementById('trust-school-select').selectedOptions[0].text;
                        loadSchoolInTrustView(selectedSchoolId, schoolName, activeFilters);
                    } else {
                        // Re-load the whole trust dashboard with filters
                        loadTrustDashboard(activeFilters); 
                    }
                } else if (isSuperUser && currentEstablishmentId) {
                    // When in super user mode for a single establishment, reload everything
                    loadDashboardWithEstablishment(currentEstablishmentId, selectedEstablishmentName, selectedCycle, activeFilters);
                } else if (currentStaffAdminId) {
                    // For a normal user, reload all sections with filters
                    loadOverviewData(currentStaffAdminId, selectedCycle, activeFilters);
                    loadQLAData(currentStaffAdminId, null, null, activeFilters);
                    loadStudentCommentInsights(currentStaffAdminId, null, null, activeFilters);
                }
            });
        }
        
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        if (clearFiltersBtn) {
            const newClearBtn = clearFiltersBtn.cloneNode(true);
            clearFiltersBtn.parentNode.replaceChild(newClearBtn, clearFiltersBtn);
            
            newClearBtn.addEventListener('click', () => {
                // Clear all filter inputs
                document.getElementById('student-search').value = '';
                document.getElementById('group-filter').value = '';
                document.getElementById('course-filter').value = '';
                document.getElementById('year-group-filter').value = '';
                document.getElementById('faculty-filter').value = '';
                
                // Clear the active filters display
                updateActiveFiltersDisplay([]);
                
                // Reload data without filters
                const selectedCycle = document.getElementById('cycle-select') ? 
                    parseInt(document.getElementById('cycle-select').value, 10) : 1;
                
                if (currentAnalysisType === 'trust') {
                    const selectedSchoolId = document.getElementById('trust-school-select')?.value;
                    if (selectedSchoolId) {
                        const schoolName = document.getElementById('trust-school-select').selectedOptions[0].text;
                        loadSchoolInTrustView(selectedSchoolId, schoolName, []);
                    } else {
                        loadTrustDashboard([]);
                    }
                } else if (isSuperUser && currentEstablishmentId) {
                    loadDashboardWithEstablishment(currentEstablishmentId, selectedEstablishmentName, selectedCycle, []);
                } else {
                    log("Clearing all filters");
                    loadOverviewData(currentStaffAdminId, selectedCycle, []);
                    loadQLAData(currentStaffAdminId, null, null, []);
                    loadStudentCommentInsights(currentStaffAdminId, null, null, []);
                }
            });
        }
    }

    // --- Filter Management Functions ---
    function getActiveFilters() {
        const filters = [];
        const activeFilterDisplay = [];
        
        // Student search filter
        const studentSearch = document.getElementById('student-search')?.value.trim();
        if (studentSearch) {
            activeFilterDisplay.push({ type: 'Student', value: studentSearch, priority: true });
            // For name fields in Knack, we typically need to search both first and last name
            filters.push({
                match: 'or',
                rules: [
                    {
                        field: 'field_187', // Student name field
                        operator: 'contains',
                        value: studentSearch,
                        field_name: 'first' // Search in first name
                    },
                    {
                        field: 'field_187',
                        operator: 'contains', 
                        value: studentSearch,
                        field_name: 'last' // Search in last name
                    }
                ]
            });
        }
        
        // Group filter - could be text or connection field
        const groupFilter = document.getElementById('group-filter')?.value;
        const groupText = document.getElementById('group-filter')?.selectedOptions[0]?.textContent;
        if (groupFilter && groupText !== 'All Groups') {
            activeFilterDisplay.push({ type: 'Group', value: groupText });
            // Check if the value looks like an object ID (for connected fields)
            // Otherwise treat as text field
            const isObjectId = /^[a-f0-9]{24}$/i.test(groupFilter);
            filters.push({
                field: 'field_223',
                operator: isObjectId ? 'contains' : 'is',
                value: groupFilter
            });
        }
        
        // Course filter
        const courseFilter = document.getElementById('course-filter')?.value;
        const courseText = document.getElementById('course-filter')?.selectedOptions[0]?.textContent;
        if (courseFilter && courseText !== 'All Courses') {
            activeFilterDisplay.push({ type: 'Course', value: courseText });
            filters.push({
                field: 'field_2299',
                operator: 'is',
                value: courseFilter
            });
        }
        
        // Year Group filter
        const yearGroupFilter = document.getElementById('year-group-filter')?.value;
        const yearGroupText = document.getElementById('year-group-filter')?.selectedOptions[0]?.textContent;
        if (yearGroupFilter && yearGroupText !== 'All Year Groups') {
            activeFilterDisplay.push({ type: 'Year Group', value: yearGroupText });
            filters.push({
                field: 'field_144',
                operator: 'is',
                value: yearGroupFilter
            });
        }
        
        // Faculty filter
        const facultyFilter = document.getElementById('faculty-filter')?.value;
        const facultyText = document.getElementById('faculty-filter')?.selectedOptions[0]?.textContent;
        if (facultyFilter && facultyText !== 'All Faculties') {
            activeFilterDisplay.push({ type: 'Faculty', value: facultyText });
            filters.push({
                field: 'field_782',
                operator: 'is',
                value: facultyFilter
            });
        }
        
        // Update the active filters display
        updateActiveFiltersDisplay(activeFilterDisplay);
        
        return filters;
    }

    function updateActiveFiltersDisplay(activeFilters) {
        const displayContainer = document.getElementById('active-filters-display');
        const filtersList = document.getElementById('active-filters-list');
        
        if (!displayContainer || !filtersList) return;
        
        if (activeFilters.length === 0) {
            displayContainer.style.display = 'none';
            return;
        }
        
        displayContainer.style.display = 'block';
        filtersList.innerHTML = '';
        
        // Sort filters to show priority (student) first
        activeFilters.sort((a, b) => {
            if (a.priority && !b.priority) return -1;
            if (!a.priority && b.priority) return 1;
            return 0;
        });
        
        activeFilters.forEach(filter => {
            const filterTag = document.createElement('div');
            filterTag.className = 'active-filter-tag';
            if (filter.priority) filterTag.classList.add('priority');
            
            filterTag.innerHTML = `
                <span class="filter-type">${filter.type}:</span>
                <span class="filter-value">${filter.value}</span>
            `;
            
            filtersList.appendChild(filterTag);
        });
    }

    async function populateFilterDropdowns(staffAdminId, establishmentId = null) {
        log("Populating filter dropdowns");
        
        try {
            // Fetch all records based on mode
            let allRecords = [];
            const filters = [];
            
            if (establishmentId) {
                // Super User mode - filter by establishment
                filters.push({
                    field: 'field_133',
                    operator: 'is',
                    value: establishmentId
                });
            } else if (staffAdminId) {
                // Normal mode - filter by staff admin
                filters.push({
                    field: 'field_439',
                    operator: 'is',
                    value: staffAdminId
                });
            }
            
            if (filters.length > 0) {
                allRecords = await fetchDataFromKnack(objectKeys.vespaResults, filters);
            }
            
            if (!allRecords || allRecords.length === 0) {
                log("No records found to populate filters");
                return;
            }
            
            log(`Processing ${allRecords.length} records for filter values`);
            
            // Extract unique values for each filter
            const groups = new Set();
            const courses = new Set();
            const yearGroups = new Set();
            const faculties = new Set();
            
            // Debug: Log first record to see field structure
            if (allRecords.length > 0) {
                log("Sample record for debugging:", {
                    field_223: allRecords[0].field_223,
                    field_223_raw: allRecords[0].field_223_raw,
                    field_2299: allRecords[0].field_2299,
                    field_2299_raw: allRecords[0].field_2299_raw,
                    field_144_raw: allRecords[0].field_144_raw,
                    field_782_raw: allRecords[0].field_782_raw
                });
            }
            
            allRecords.forEach((record, index) => {
                // Group (field_223) - Handle as text field
                // Try both field_223_raw and field_223 as Knack might store text fields differently
                const groupFieldValue = record.field_223_raw || record.field_223;
                if (groupFieldValue) {
                    if (index < 3) { // Log first few records for debugging
                        log(`Record ${index} - Group field_223_raw:`, record.field_223_raw, "field_223:", record.field_223);
                    }
                    // If it's an array (connected field), handle differently
                    if (Array.isArray(groupFieldValue)) {
                        groupFieldValue.forEach((groupId, idx) => {
                            if (groupId) {
                                // Try to get display value
                                let displayValue = record.field_223 || groupId;
                                if (Array.isArray(record.field_223)) {
                                    displayValue = record.field_223[idx] || groupId;
                                }
                                groups.add(JSON.stringify({ id: groupId, name: displayValue }));
                            }
                        });
                    } else if (typeof groupFieldValue === 'object' && groupFieldValue !== null) {
                        // Sometimes Knack returns objects for connected fields
                        if (groupFieldValue.id) {
                            groups.add(JSON.stringify({ 
                                id: groupFieldValue.id, 
                                name: groupFieldValue.identifier || groupFieldValue.value || groupFieldValue.id 
                            }));
                        }
                    } else {
                        // It's a text field - use the value directly
                        const groupValue = groupFieldValue.toString().trim();
                        if (groupValue && groupValue !== 'null' && groupValue !== 'undefined') {
                            groups.add(groupValue);
                        }
                    }
                }
                
                // Course (field_2299) - Handle both text and connected fields
                const courseFieldValue = record.field_2299_raw || record.field_2299;
                if (courseFieldValue) {
                    if (index < 3) { // Log first few records for debugging
                        log(`Record ${index} - Course field_2299_raw:`, record.field_2299_raw, "field_2299:", record.field_2299);
                    }
                    if (Array.isArray(courseFieldValue)) {
                        // Connected field
                        courseFieldValue.forEach((courseId, idx) => {
                            if (courseId) {
                                let displayValue = record.field_2299 || courseId;
                                if (Array.isArray(record.field_2299)) {
                                    displayValue = record.field_2299[idx] || courseId;
                                }
                                courses.add(JSON.stringify({ id: courseId, name: displayValue }));
                            }
                        });
                    } else if (typeof courseFieldValue === 'object' && courseFieldValue !== null) {
                        // Sometimes Knack returns objects for connected fields
                        if (courseFieldValue.id) {
                            courses.add(JSON.stringify({ 
                                id: courseFieldValue.id, 
                                name: courseFieldValue.identifier || courseFieldValue.value || courseFieldValue.id 
                            }));
                        }
                    } else {
                        // Text field
                        const courseValue = courseFieldValue.toString().trim();
                        if (courseValue && courseValue !== 'null' && courseValue !== 'undefined') {
                            courses.add(courseValue);
                        }
                    }
                }
                
                // Year Group (field_144)
                if (record.field_144_raw) {
                    const yearGroupValue = record.field_144_raw.toString().trim();
                    if (yearGroupValue) {
                        yearGroups.add(yearGroupValue);
                    }
                }
                
                // Faculty (field_782)
                if (record.field_782_raw) {
                    const facultyValue = record.field_782_raw.toString().trim();
                    if (facultyValue) {
                        faculties.add(facultyValue);
                    }
                }
            });
            
            // Debug: Log collected values
            log("Collected filter values:", {
                groups: Array.from(groups),
                courses: Array.from(courses),
                yearGroups: Array.from(yearGroups),
                faculties: Array.from(faculties)
            });
            
            // Populate dropdowns
            // Process groups - could be strings or JSON objects
            const groupItems = Array.from(groups).map(g => {
                try {
                    return JSON.parse(g);
                } catch (e) {
                    // It's a plain string, not JSON
                    return g;
                }
            }).sort((a, b) => {
                const aName = typeof a === 'object' ? a.name : a;
                const bName = typeof b === 'object' ? b.name : b;
                return aName.localeCompare(bName);
            });
            
            // Process courses - could be strings or JSON objects
            const courseItems = Array.from(courses).map(c => {
                try {
                    return JSON.parse(c);
                } catch (e) {
                    // It's a plain string, not JSON
                    return c;
                }
            }).sort((a, b) => {
                const aName = typeof a === 'object' ? a.name : a;
                const bName = typeof b === 'object' ? b.name : b;
                return aName.localeCompare(bName);
            });
            
            populateDropdown('group-filter', groupItems, 'name', 'id');
            populateDropdown('course-filter', courseItems, 'name', 'id');
            populateDropdown('year-group-filter', Array.from(yearGroups).sort());
            populateDropdown('faculty-filter', Array.from(faculties).sort());
            
        } catch (error) {
            errorLog("Failed to populate filter dropdowns", error);
        }
    }
    
    function populateDropdown(dropdownId, items, displayProperty = null, valueProperty = null) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        
        // Keep the "All" option
        const allOption = dropdown.querySelector('option[value=""]');
        dropdown.innerHTML = '';
        if (allOption) dropdown.appendChild(allOption);
        
        items.forEach(item => {
            const option = document.createElement('option');
            if (typeof item === 'object' && item !== null) {
                // It's an object
                if (displayProperty && item[displayProperty] !== undefined) {
                    option.textContent = item[displayProperty];
                    option.value = valueProperty && item[valueProperty] !== undefined ? item[valueProperty] : item[displayProperty];
                } else {
                    // Fallback if properties don't exist
                    option.value = JSON.stringify(item);
                    option.textContent = JSON.stringify(item);
                }
            } else {
                // It's a simple value (string/number)
                option.value = item;
                option.textContent = item;
            }
            dropdown.appendChild(option);
        });
        
        log(`Populated ${dropdownId} with ${items.length} items`);
    }
    
    // New function to populate filter dropdowns from cached data
    function populateFilterDropdownsFromCache(filterOptions) {
        if (!filterOptions) {
            log("No filter options provided to populateFilterDropdownsFromCache");
            return;
        }
        
        log("Populating filter dropdowns from cache");
        
        // Populate each dropdown
        populateDropdown('group-filter', filterOptions.groups || []);
        populateDropdown('course-filter', filterOptions.courses || []);
        populateDropdown('year-group-filter', filterOptions.yearGroups || []);
        populateDropdown('faculty-filter', filterOptions.faculties || []);
        
        log("Filter dropdowns populated from cache");
    }

    // New function to populate filter dropdowns from cached data
    function populateFilterDropdownsFromCache(filterOptions) {
        if (!filterOptions) {
            log("No filter options provided to populateFilterDropdownsFromCache");
            return;
        }
        
        log("Populating filter dropdowns from cache");
        
        // Populate each dropdown
        populateDropdown('group-filter', filterOptions.groups || []);
        populateDropdown('course-filter', filterOptions.courses || []);
        populateDropdown('year-group-filter', filterOptions.yearGroups || []);
        populateDropdown('faculty-filter', filterOptions.faculties || []);
        
        log("Filter dropdowns populated from cache");
    }

    // --- Section 1: Overview and Benchmarking ---
    // --- ERI (Exam Readiness Index) Functions ---
    async function calculateSchoolERI(staffAdminId, cycle, additionalFilters = [], establishmentId = null) {
        log(`Fetching School ERI for Cycle ${cycle} from backend`);
        
        try {
            // Build URL with parameters
            let url = `${config.herokuAppUrl}/api/calculate-eri?cycle=${cycle}`;
            
            if (establishmentId) {
                url += `&establishmentId=${establishmentId}`;
            } else if (staffAdminId) {
                url += `&staffAdminId=${staffAdminId}`;
            } else {
                log("No Staff Admin ID or Establishment ID provided for ERI calculation");
                return null;
            }
            
            // Note: Additional filters would need to be handled server-side if needed
            // For now, the backend calculates ERI for all records matching the establishment/staff admin
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `ERI calculation failed with status ${response.status}` }));
                throw new Error(errorData.message || `ERI calculation failed with status ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.school_eri === null || data.school_eri === undefined) {
                log("No ERI data returned from backend");
                return null;
            }
            
            log(`Received School ERI: ${data.school_eri} from ${data.response_count} responses`);
            
            return {
                value: data.school_eri,
                responseCount: data.response_count
            };
            
        } catch (error) {
            errorLog("Failed to fetch school ERI from backend", error);
            return null;
        }
    }
    
    async function getNationalERI(cycle) {
        log(`Fetching National ERI for Cycle ${cycle} from backend`);
        
        try {
            const url = `${config.herokuAppUrl}/api/national-eri?cycle=${cycle}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `National ERI fetch failed with status ${response.status}` }));
                throw new Error(errorData.message || `National ERI fetch failed with status ${response.status}`);
            }
            
            const data = await response.json();
            
            log(`Received National ERI: ${data.national_eri} (${data.source})`);
            if (data.message) {
                log(`National ERI message: ${data.message}`);
            }
            
            return data.national_eri;
            
        } catch (error) {
            errorLog("Failed to fetch national ERI from backend", error);
            // Return fallback value
            return 3.5;
        }
    }
    
    function renderERISpeedometer(schoolERI, nationalERI, cycle) {
        // Store ERI values globally for modal access
        window.currentERIData = {
            school: schoolERI,
            national: nationalERI,
            cycle: cycle
        };
        
        // Update the compact ERI display
        const eriValueDisplay = document.getElementById('eri-value-display');
        if (eriValueDisplay) {
            eriValueDisplay.textContent = schoolERI ? schoolERI.value.toFixed(1) : 'N/A';
        }
        
        // Create the small gauge chart
        setTimeout(() => {
            createCompactERIGauge(schoolERI ? schoolERI.value : null, nationalERI);
        }, 100);
    }
    
    function createERIGaugeChart(schoolValue, nationalValue) {
        const canvas = document.getElementById('eri-gauge-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Destroy previous chart if exists
        if (window.eriGaugeChart) {
            window.eriGaugeChart.destroy();
        }
        
        // Create data for the gauge (using doughnut chart)
        const gaugeData = schoolValue || 0;
        const remainingData = 5 - gaugeData;
        
        // Color segments based on value ranges
        const backgroundColors = [
            '#ef4444', // 0-1: Red
            '#f59e0b', // 1-2: Orange
            '#10b981', // 2-3: Green
            '#3b82f6', // 3-4: Blue
            '#1e40af'  // 4-5: Dark Blue
        ];
        
        // Determine which color to use for the filled portion
        let fillColor = backgroundColors[0];
        if (gaugeData >= 4) fillColor = backgroundColors[4];
        else if (gaugeData >= 3) fillColor = backgroundColors[3];
        else if (gaugeData >= 2) fillColor = backgroundColors[2];
        else if (gaugeData >= 1) fillColor = backgroundColors[1];
        
        window.eriGaugeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [gaugeData, remainingData],
                    backgroundColor: [fillColor, 'rgba(255, 255, 255, 0.1)'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    },
                    datalabels: {
                        display: false
                    }
                }
            },
            plugins: [{
                id: 'eri-text',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    const width = chart.width;
                    const height = chart.height;
                    
                    ctx.save();
                    
                    // Draw scale labels
                    ctx.fillStyle = '#64748b';
                    ctx.font = '10px Inter';
                    ctx.textAlign = 'center';
                    
                    // Position labels around the arc
                    const centerX = width / 2;
                    const centerY = height - 10;
                    const radius = Math.min(width, height) / 2 - 20;
                    
                    // Draw scale numbers (1-5)
                    for (let i = 0; i <= 4; i++) {
                        const angle = (Math.PI) * (i / 4); // 0 to PI (180 degrees)
                        const x = centerX - radius * Math.cos(angle);
                        const y = centerY - radius * Math.sin(angle);
                        ctx.fillText((i + 1).toString(), x, y);
                    }
                    
                    // Draw center value
                    if (schoolValue) {
                        ctx.font = 'bold 24px Inter';
                        ctx.fillStyle = fillColor;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(schoolValue.toFixed(1), centerX, centerY - 10);
                    }
                    
                    // Draw global benchmark marker if available
                    if (nationalValue) {
                        // Calculate angle for national value position
                        // The gauge goes from 1 to 5, displayed as a 180-degree arc
                        // Angle calculation: PI (leftmost) to 0 (rightmost)
                        const valueRange = 5 - 1; // 4
                        const normalizedValue = (nationalValue - 1) / valueRange; // 0 to 1
                        const nationalAngle = Math.PI * (1 - normalizedValue); // PI to 0
                        
                        const markerRadius = radius - 15;
                        const markerX = centerX + markerRadius * Math.cos(nationalAngle);
                        const markerY = centerY - markerRadius * Math.sin(nationalAngle);
                        
                        // Draw marker line
                        ctx.strokeStyle = '#ffd93d';
                        ctx.lineWidth = 3;
                        ctx.setLineDash([5, 3]);
                        ctx.beginPath();
                        
                        // Draw radial line from inner to outer edge
                        const innerRadius = markerRadius - 10;
                        const outerRadius = markerRadius + 10;
                        ctx.moveTo(centerX + innerRadius * Math.cos(nationalAngle), 
                                  centerY - innerRadius * Math.sin(nationalAngle));
                        ctx.lineTo(centerX + outerRadius * Math.cos(nationalAngle), 
                                  centerY - outerRadius * Math.sin(nationalAngle));
                        ctx.stroke();
                        
                        // Draw label
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#ffd93d';
                        ctx.font = 'bold 10px Inter';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText('Global', markerX, markerY - 15);
                    }
                    
                    ctx.restore();
                }
            }]
        });
    }
    
    function createCompactERIGauge(schoolValue, nationalValue) {
        const canvas = document.getElementById('eri-gauge-small-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Update the ERI display values
        const eriValueDisplay = document.getElementById('eri-value-display');
        const eriNationalDisplay = document.getElementById('eri-national-display');
        const eriInterpretationText = document.getElementById('eri-interpretation-text');
        
        if (eriValueDisplay) eriValueDisplay.textContent = schoolValue ? schoolValue.toFixed(1) : '-';
        if (eriNationalDisplay) eriNationalDisplay.textContent = nationalValue ? nationalValue.toFixed(1) : '-';
        if (eriInterpretationText) {
            const interpretation = getERIInterpretationText(schoolValue);
            eriInterpretationText.textContent = interpretation;
        }
        
        // Destroy previous chart if exists
        if (window.eriCompactGauge) {
            window.eriCompactGauge.destroy();
        }
        
        // Determine color based on value
        let gaugeColor = '#ef4444'; // red
        if (schoolValue >= 4) gaugeColor = '#3b82f6'; // blue
        else if (schoolValue >= 3) gaugeColor = '#10b981'; // green
        else if (schoolValue >= 2) gaugeColor = '#f59e0b'; // orange
        
        // Check if gauge plugin is available
        if (typeof Chart.controllers.gauge === 'undefined') {
            log("Gauge plugin not found, using fallback doughnut chart");
            // Fallback to doughnut chart
            window.eriCompactGauge = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [schoolValue || 0, 5 - (schoolValue || 0)],
                        backgroundColor: [gaugeColor, 'rgba(255, 255, 255, 0.1)'],
                        borderWidth: 0,
                        circumference: 180,
                        rotation: 270
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false },
                        datalabels: { display: false }
                    }
                }
            });
        } else {
            // Use proper gauge chart
            window.eriCompactGauge = new Chart(ctx, {
                type: 'gauge',
                data: {
                    datasets: [{
                        value: schoolValue || 0,
                        minValue: 0,
                        data: [1, 2, 3, 4, 5],
                        backgroundColor: ['#ef4444', '#f59e0b', '#eab308', '#10b981', '#3b82f6'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    needle: {
                        radiusPercentage: 2,
                        widthPercentage: 3.2,
                        lengthPercentage: 80,
                        color: 'rgba(0, 0, 0, 1)'
                    },
                    valueLabel: {
                        display: false // We're showing the value separately
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false },
                        datalabels: { display: false }
                    }
                }
            });
        }
    }
    
    function getERIInterpretationText(eriValue) {
        if (!eriValue) {
            return 'No data available';
        }
        
        if (eriValue >= 4) {
            return 'Excellent readiness - Students confident & prepared';
        } else if (eriValue >= 3) {
            return 'Good readiness - Room for improvement';
        } else if (eriValue >= 2) {
            return 'Below average - Support needed';
        } else {
            return 'Low readiness - Urgent intervention required';
        }
    }
    
    // Make ERI info modal function globally accessible
    window.showERIInfoModal = function() {
        let modal = document.querySelector('.eri-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'eri-info-modal';
            
            // Build the current values section
            let currentValuesSection = '';
            if (window.currentERIData) {
                const schoolValue = window.currentERIData.school ? window.currentERIData.school.value : null;
                const nationalValue = window.currentERIData.national;
                const cycle = window.currentERIData.cycle;
                let colorHex = '#ef4444'; // red
                if (schoolValue >= 4) colorHex = '#3b82f6'; // blue
                else if (schoolValue >= 3) colorHex = '#10b981'; // green
                else if (schoolValue >= 2) colorHex = '#f59e0b'; // orange
                
                currentValuesSection = `
                    <div class="eri-section" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.1)); border: 1px solid rgba(59, 130, 246, 0.3); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
                        <h4 style="color: #3b82f6; margin-top: 0;">Current ERI Score - Cycle ${cycle}</h4>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem;">
                            <div style="text-align: center;">
                                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">Your School</div>
                                <div style="font-size: 2rem; font-weight: 700; color: ${colorHex};">
                                    ${schoolValue ? schoolValue.toFixed(1) : 'N/A'}
                                </div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">Global Benchmark</div>
                                <div style="font-size: 2rem; font-weight: 700; color: var(--text-secondary);">
                                    ${nationalValue ? nationalValue.toFixed(1) : 'N/A'}
                                </div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem;">Difference</div>
                                <div style="font-size: 2rem; font-weight: 700; color: ${schoolValue && nationalValue && schoolValue >= nationalValue ? '#10b981' : '#ef4444'};">
                                    ${schoolValue && nationalValue ? 
                                        ((schoolValue > nationalValue ? '+' : '') + ((schoolValue - nationalValue) / nationalValue * 100).toFixed(1) + '%') 
                                        : 'N/A'}
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                            ${schoolValue ? getERIInterpretationText(schoolValue) : 'No data available'}
                        </div>
                    </div>
                `;
            }
            
            modal.innerHTML = `
                <div class="eri-info-content">
                    <div class="eri-info-header">
                        <h3>Understanding the Exam Readiness Index (ERI)</h3>
                        <button class="eri-info-close" onclick="window.hideERIInfoModal()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="eri-info-body">
                        ${currentValuesSection}
                        <div class="eri-section" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                            <h4 style="color: #f59e0b; margin-top: 0;">⚠️ Development Notice</h4>
                            <p style="margin-bottom: 0;">The ERI is in early stages of development. We are continuously analyzing data and refining the methodology to improve its accuracy and predictive value. Current results should be interpreted as indicative rather than definitive.</p>
                        </div>
                        
                        <div class="eri-section">
                            <h4>What is ERI?</h4>
                            <p>The Exam Readiness Index (ERI) is a composite measure that gauges how prepared students feel for their exams. It combines three key psychological factors that research shows correlate with exam performance.</p>
                        </div>
                        
                        <div class="eri-section">
                            <h4>Questions Used</h4>
                            <p>The ERI is calculated from responses to three psychometric questions:</p>
                            <ol style="padding-left: 1.5rem;">
                                <li style="margin-bottom: 0.5rem;"><strong>Support Awareness:</strong><br/>
                                    <em>"I know where to get support if I need it"</em><br/>
                                    <span style="color: var(--text-muted); font-size: 0.9rem;">Measures whether students are aware of available support systems</span>
                                </li>
                                <li style="margin-bottom: 0.5rem;"><strong>Exam Preparedness:</strong><br/>
                                    <em>"I feel prepared for my exams"</em><br/>
                                    <span style="color: var(--text-muted); font-size: 0.9rem;">Assesses students' perceived readiness for assessments</span>
                                </li>
                                <li style="margin-bottom: 0.5rem;"><strong>Achievement Confidence:</strong><br/>
                                    <em>"I feel I will achieve my potential"</em><br/>
                                    <span style="color: var(--text-muted); font-size: 0.9rem;">Evaluates students' belief in their ability to succeed</span>
                                </li>
                            </ol>
                        </div>
                        
                        <div class="eri-section">
                            <h4>Calculation Method</h4>
                            <div style="background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: 8px; font-family: monospace;">
                                ERI = (Support + Preparedness + Confidence) / 3
                            </div>
                            <p style="margin-top: 1rem;">Each question is answered on a 1-5 scale:</p>
                            <ul>
                                <li>1 = Strongly Disagree</li>
                                <li>2 = Disagree</li>
                                <li>3 = Neutral</li>
                                <li>4 = Agree</li>
                                <li>5 = Strongly Agree</li>
                            </ul>
                            <p>The three scores are averaged to produce an overall ERI score between 1 and 5.</p>
                        </div>
                        
                        <div class="eri-section">
                            <h4>Rationale</h4>
                            <p>These three factors were selected because they represent:</p>
                            <ul>
                                <li><strong>Environmental factors:</strong> Access to support (external resources)</li>
                                <li><strong>Cognitive factors:</strong> Preparation level (knowledge and skills)</li>
                                <li><strong>Affective factors:</strong> Confidence (emotional readiness)</li>
                            </ul>
                            <p>Together, they provide a holistic view of exam readiness that goes beyond academic ability alone.</p>
                        </div>
                        
                        <div class="eri-section">
                            <h4>Score Interpretation</h4>
                            <div class="eri-score-guide">
                                <div class="score-range excellent">
                                    <span class="range">4.0 - 5.0</span>
                                    <span class="label">Excellent Readiness</span>
                                    <p>Students are confident, well-prepared, and know where to find help.</p>
                                </div>
                                <div class="score-range good">
                                    <span class="range">3.0 - 3.9</span>
                                    <span class="label">Good Readiness</span>
                                    <p>Most students feel ready, but some areas could be strengthened.</p>
                                </div>
                                <div class="score-range below-average">
                                    <span class="range">2.0 - 2.9</span>
                                    <span class="label">Below Average</span>
                                    <p>Significant concerns exist. Focus on support systems and preparation.</p>
                                </div>
                                <div class="score-range low">
                                    <span class="range">1.0 - 1.9</span>
                                    <span class="label">Low Readiness</span>
                                    <p>Urgent intervention needed across all three areas.</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="eri-section">
                            <h4>Using ERI Results</h4>
                            <ul>
                                <li><strong>Low Support Scores:</strong> Improve visibility of support services, implement peer mentoring, increase teacher availability</li>
                                <li><strong>Low Preparedness:</strong> Review revision strategies, provide study resources, increase practice opportunities</li>
                                <li><strong>Low Confidence:</strong> Build self-efficacy through achievable goals, positive feedback, and success experiences</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    window.hideERIInfoModal();
                }
            });
        }
        
        // Ensure modal shows with animation
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
    };
    
    window.hideERIInfoModal = function() {
        const modal = document.querySelector('.eri-info-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    };

    async function loadOverviewData(staffAdminId, cycle = 1, additionalFilters = [], establishmentId = null, preloadedData = null) {
        log(`Loading overview data with Staff Admin ID: ${staffAdminId}, Establishment ID: ${establishmentId} for Cycle: ${cycle}`);
        const loadingIndicator = document.getElementById('loading-indicator');
        const combinedContainer = document.getElementById('vespa-combined-container');

        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (combinedContainer) combinedContainer.style.display = 'none'; // Hide while loading

        try {
            let batchData;

            // If data is preloaded (i.e., for a trust), use it directly
            if (preloadedData) {
                log("Using preloaded data for overview (trust view)");
                batchData = preloadedData;
                GlobalLoader.updateProgress(50, 'Processing aggregated trust data...');
            } else {
                // Otherwise, fetch data as usual
                const cachedData = DataCache.get('initialData');
                if (!cachedData || cachedData.cycle !== cycle || 
                    cachedData.staffAdminId !== staffAdminId || 
                    cachedData.establishmentId !== establishmentId) {
                    GlobalLoader.updateProgress(40, 'Loading dashboard data...');
                    batchData = await fetchDashboardInitialData(staffAdminId, establishmentId, cycle);
                } else {
                    log("Using cached data for overview");
                    batchData = cachedData;
                    GlobalLoader.updateProgress(50, 'Processing cached data...');
                }
            }
            
            let schoolVespaResults = batchData.vespaResults || [];
            let nationalBenchmarkRecord = batchData.nationalBenchmark;
            
            // Apply additional filters if any
            if (additionalFilters && additionalFilters.length > 0) {
                schoolVespaResults = applyFiltersToRecords(schoolVespaResults, additionalFilters);
                log(`Applied additional filters, results: ${schoolVespaResults.length}`);
            }
            
            GlobalLoader.updateProgress(60, 'Processing VESPA scores...');
            
            const schoolAverages = calculateSchoolVespaAverages(schoolVespaResults, cycle);
            log(`School Averages (Cycle ${cycle}):`, schoolAverages);

            let nationalAverages = { vision: 0, effort: 0, systems: 0, practice: 0, attitude: 0, overall: 0 };
            let nationalDistributions = null; // Will hold parsed JSON distribution data
            
            if (nationalBenchmarkRecord) {
                nationalAverages = getNationalVespaAveragesFromRecord(nationalBenchmarkRecord, cycle);
                log("Processed National Averages for charts:", nationalAverages);
                
                // Parse national distribution JSON data
                const distributionFieldMap = {
                    1: 'field_3409', // distribution_json_cycle1
                    2: 'field_3410', // distribution_json_cycle2
                    3: 'field_3411'  // distribution_json_cycle3
                };
                
                const distributionField = distributionFieldMap[cycle];
                if (distributionField && nationalBenchmarkRecord[distributionField + '_raw']) {
                    try {
                        nationalDistributions = JSON.parse(nationalBenchmarkRecord[distributionField + '_raw']);
                        log(`Parsed National Distribution data for Cycle ${cycle}:`, nationalDistributions);
                    } catch (e) {
                        errorLog(`Failed to parse national distribution JSON for cycle ${cycle}:`, e);
                    }
                }
            } else {
                log("National benchmark record was null, nationalAverages will be default/empty.");
            }
            
            GlobalLoader.updateProgress(70, 'Calculating statistics...');
            
            // Update response statistics using cached data
            updateResponseStatsFromCache(schoolVespaResults, cycle);
            
            // Fetch ERI values (batch may not include them for large schools)
            let schoolERI = batchData.schoolERI;
            let nationalERI = batchData.nationalERI;

            if (!schoolERI || schoolERI.value === undefined || schoolERI.value === null) {
                schoolERI = await calculateSchoolERI(staffAdminId, cycle, additionalFilters, establishmentId);
            }

            if (nationalERI === undefined || nationalERI === null) {
                nationalERI = await getNationalERI(cycle);
            }
            
            GlobalLoader.updateProgress(80, 'Rendering visualizations...');
            
            renderERISpeedometer(schoolERI, nationalERI, cycle);
            renderAveragesChart(schoolAverages, nationalAverages, cycle);
            renderDistributionCharts(schoolVespaResults, nationalAverages, themeColors, cycle, nationalDistributions);

        } catch (error) {
            errorLog("Failed to load overview data", error);
            const overviewSection = document.getElementById('overview-section');
            if(overviewSection) overviewSection.innerHTML = "<p>Error loading overview data. Please check console.</p>";
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (combinedContainer) combinedContainer.style.display = 'grid'; // Show again with grid display
        }
    }

    // Helper function to apply filters to records in memory
    function applyFiltersToRecords(records, filters) {
        return records.filter(record => {
            return filters.every(filter => {
                const fieldValue = record[filter.field + '_raw'] || record[filter.field];
                
                if (filter.match === 'or' && filter.rules) {
                    // Handle OR conditions
                    return filter.rules.some(rule => {
                        const ruleValue = record[rule.field + '_raw'] || record[rule.field];
                        return matchesFilter(ruleValue, rule.operator, rule.value, rule.field_name);
                    });
                }
                
                return matchesFilter(fieldValue, filter.operator, filter.value);
            });
        });
    }
    
    // Helper function to match filter conditions
    function matchesFilter(fieldValue, operator, filterValue, fieldName = null) {
        if (fieldValue === null || fieldValue === undefined) return false;
        
        // Handle name fields with first/last
        if (fieldName && typeof fieldValue === 'object') {
            fieldValue = fieldValue[fieldName] || '';
        }
        
        // Convert to string for comparison
        const fieldStr = String(fieldValue).toLowerCase();
        const filterStr = String(filterValue).toLowerCase();
        
        switch (operator) {
            case 'is':
                return fieldStr === filterStr;
            case 'is not':
                return fieldStr !== filterStr;
            case 'contains':
                return fieldStr.includes(filterStr);
            case 'does not contain':
                return !fieldStr.includes(filterStr);
            default:
                return false;
        }
    }
    
    // Update response stats from cached data
    function updateResponseStatsFromCache(vespaResults, cycle) {
        const totalStudents = vespaResults.length;
        
        // Count responses where vision score (V1) is not empty for the selected cycle
        const fieldMappings = {
            cycle1: { v: 'field_155' },
            cycle2: { v: 'field_161' },
            cycle3: { v: 'field_167' }
        };
        
        const visionField = fieldMappings[`cycle${cycle}`]?.v;
        if (!visionField) {
            errorLog(`Invalid cycle number ${cycle} for response counting.`);
            return;
        }
        
        let responseCount = 0;
        vespaResults.forEach(record => {
            const visionScore = record[visionField + '_raw'];
            if (visionScore !== null && visionScore !== undefined && visionScore !== '') {
                responseCount++;
            }
        });
        
        // Calculate completion rate
        const completionRate = totalStudents > 0 
            ? ((responseCount / totalStudents) * 100).toFixed(1) 
            : '0.0';
        
        // Update the UI
        const cycleResponsesElement = document.getElementById('cycle-responses');
        const totalStudentsElement = document.getElementById('total-students');
        const completionRateElement = document.getElementById('completion-rate');
        
        if (cycleResponsesElement) cycleResponsesElement.textContent = responseCount.toLocaleString();
        if (totalStudentsElement) totalStudentsElement.textContent = totalStudents.toLocaleString();
        if (completionRateElement) completionRateElement.textContent = `${completionRate}%`;
        
        log(`Response Stats - Total Students: ${totalStudents}, Responses: ${responseCount}, Completion: ${completionRate}%`);
    }

    // Renamed to be specific for school data and to potentially handle cycles
    function calculateSchoolVespaAverages(results, cycle) {
        log(`Calculating School VESPA averages for Cycle ${cycle} using historical fields.`);
        
        const averages = { vision: 0, effort: 0, systems: 0, practice: 0, attitude: 0, overall: 0 };
        let validRecordsCount = 0;

        if (!Array.isArray(results) || results.length === 0) {
            log("calculateSchoolVespaAverages: Input is not a valid array or is empty", results);
            return averages;
        }

        const fieldMappings = {
            cycle1: { v: 'field_155', e: 'field_156', s: 'field_157', p: 'field_158', a: 'field_159', o: 'field_160' },
            cycle2: { v: 'field_161', e: 'field_162', s: 'field_163', p: 'field_164', a: 'field_165', o: 'field_166' },
            cycle3: { v: 'field_167', e: 'field_168', s: 'field_169', p: 'field_170', a: 'field_171', o: 'field_172' }
        };

        const currentCycleFields = fieldMappings[`cycle${cycle}`];

        if (!currentCycleFields) {
            errorLog(`Invalid cycle number ${cycle} for school VESPA averages field mapping.`);
            return averages; // Return default if cycle is invalid
        }

        results.forEach(record => {
            // Read scores from the specific historical fields for the given cycle
            const v = parseFloat(record[currentCycleFields.v + '_raw']);
            const e = parseFloat(record[currentCycleFields.e + '_raw']);
            const s = parseFloat(record[currentCycleFields.s + '_raw']);
            const p = parseFloat(record[currentCycleFields.p + '_raw']);
            const a = parseFloat(record[currentCycleFields.a + '_raw']);
            const o = parseFloat(record[currentCycleFields.o + '_raw']);

            if (!isNaN(o)) { // Using overall score to validate the record for this cycle
                if (!isNaN(v)) averages.vision += v;
                if (!isNaN(e)) averages.effort += e;
                if (!isNaN(s)) averages.systems += s;
                if (!isNaN(p)) averages.practice += p;
                if (!isNaN(a)) averages.attitude += a;
                averages.overall += o;
                validRecordsCount++;
            }
        });

        if (validRecordsCount > 0) {
            for (const key in averages) {
                averages[key] = parseFloat((averages[key] / validRecordsCount).toFixed(2));
            }
        }
        return averages;
    }

    // Function to calculate and update response statistics
    async function updateResponseStats(staffAdminId, cycle, additionalFilters = [], establishmentId = null) {
        log(`Updating response statistics for Cycle ${cycle}`);
        
        try {
            // Get all records based on whether we're in Super User mode or normal mode
            let allStudentRecords = [];
            const baseFilters = [];
            
            if (establishmentId) {
                // Super User mode - filter by establishment
                baseFilters.push({
                    field: 'field_133',
                    operator: 'is',
                    value: establishmentId
                });
            } else if (staffAdminId) {
                // Normal mode - filter by staff admin
                baseFilters.push({
                    field: 'field_439',
                    operator: 'is',
                    value: staffAdminId
                });
            }
            
            if (baseFilters.length > 0) {
                allStudentRecords = await fetchDataFromKnack(objectKeys.vespaResults, baseFilters);
            }
            
            const totalStudents = allStudentRecords ? allStudentRecords.length : 0;
            
            // Get filtered records if there are additional filters
            let filteredRecords = allStudentRecords;
            if (additionalFilters && additionalFilters.length > 0) {
                const filters = [...baseFilters, ...additionalFilters];
                filteredRecords = await fetchDataFromKnack(objectKeys.vespaResults, filters);
            }
            
            // Count responses where vision score (V1) is not empty for the selected cycle
            const fieldMappings = {
                cycle1: { v: 'field_155' },
                cycle2: { v: 'field_161' },
                cycle3: { v: 'field_167' }
            };
            
            const visionField = fieldMappings[`cycle${cycle}`]?.v;
            if (!visionField) {
                errorLog(`Invalid cycle number ${cycle} for response counting.`);
                return;
            }
            
            let responseCount = 0;
            if (filteredRecords && Array.isArray(filteredRecords)) {
                filteredRecords.forEach(record => {
                    const visionScore = record[visionField + '_raw'];
                    if (visionScore !== null && visionScore !== undefined && visionScore !== '') {
                        responseCount++;
                    }
                });
            }
            
            // Calculate completion rate
            const completionRate = totalStudents > 0 
                ? ((responseCount / totalStudents) * 100).toFixed(1) 
                : '0.0';
            
            // Update the UI
            const cycleResponsesElement = document.getElementById('cycle-responses');
            const totalStudentsElement = document.getElementById('total-students');
            const completionRateElement = document.getElementById('completion-rate');
            
            if (cycleResponsesElement) cycleResponsesElement.textContent = responseCount.toLocaleString();
            if (totalStudentsElement) totalStudentsElement.textContent = totalStudents.toLocaleString();
            if (completionRateElement) completionRateElement.textContent = `${completionRate}%`;
            
            log(`Response Stats - Total Students: ${totalStudents}, Responses: ${responseCount}, Completion: ${completionRate}%`);
            
        } catch (error) {
            errorLog("Failed to update response statistics", error);
            // Reset to dashes on error
            const cycleResponsesElement = document.getElementById('cycle-responses');
            const totalStudentsElement = document.getElementById('total-students');
            const completionRateElement = document.getElementById('completion-rate');
            
            if (cycleResponsesElement) cycleResponsesElement.textContent = '-';
            if (totalStudentsElement) totalStudentsElement.textContent = '-';
            if (completionRateElement) completionRateElement.textContent = '-';
        }
    }

    function getNationalVespaAveragesFromRecord(record, cycle) {
        const nationalAverages = { vision: 0, effort: 0, systems: 0, practice: 0, attitude: 0, overall: 0 };
        if (!record) return nationalAverages;

        const fieldMappings = {
            cycle1: { v: 'field_3292', e: 'field_3293', s: 'field_3294', p: 'field_3295', a: 'field_3296', o: 'field_3406' },
            cycle2: { v: 'field_3297', e: 'field_3298', s: 'field_3299', p: 'field_3300', a: 'field_3301', o: 'field_3407' },
            cycle3: { v: 'field_3302', e: 'field_3303', s: 'field_3304', p: 'field_3305', a: 'field_3306', o: 'field_3408' }
        };

        const currentCycleFields = fieldMappings[`cycle${cycle}`];
        if (!currentCycleFields) {
            errorLog(`Invalid cycle number ${cycle} for national VESPA averages.`);
            return nationalAverages;
        }

        nationalAverages.vision = parseFloat(record[currentCycleFields.v + '_raw']) || 0;
        nationalAverages.effort = parseFloat(record[currentCycleFields.e + '_raw']) || 0;
        nationalAverages.systems = parseFloat(record[currentCycleFields.s + '_raw']) || 0;
        nationalAverages.practice = parseFloat(record[currentCycleFields.p + '_raw']) || 0;
        nationalAverages.attitude = parseFloat(record[currentCycleFields.a + '_raw']) || 0;
        nationalAverages.overall = parseFloat(record[currentCycleFields.o + '_raw']) || 0;
        
        log(`Parsed National Averages from Object_120 for Cycle ${cycle}:`, nationalAverages);
        return nationalAverages;
    }

    function renderAveragesChart(schoolData, comparisonData, cycle, comparisonLabel = 'Global') {
        // Note: This function now only creates the score cards
        // The distribution charts will be created after this function is called
        const container = document.getElementById('vespa-combined-container');
        if (!container) {
            errorLog("VESPA combined container not found");
            return;
        }

        log(`Creating score cards for Cycle ${cycle}. School:`, schoolData, "Global:", comparisonData);

        // Store VESPA scores globally for report generation
        currentVespaScores = {};
        Object.keys(schoolData).forEach(key => {
            if (typeof schoolData[key] === 'number') {
                currentVespaScores[key] = schoolData[key];
            }
        });
        Object.keys(comparisonData).forEach(key => {
            if (typeof comparisonData[key] === 'number') {
                currentVespaScores[`${key}National`] = comparisonData[key];
            }
        });
        log('Stored VESPA scores globally:', currentVespaScores);

        const elementsToDisplay = [
            { key: 'vision', name: 'VISION', position: 1 },
            { key: 'effort', name: 'EFFORT', position: 2 },
            { key: 'systems', name: 'SYSTEMS', position: 3 },
            { key: 'practice', name: 'PRACTICE', position: 7 },
            { key: 'attitude', name: 'ATTITUDE', position: 8 },
            { key: 'overall', name: 'OVERALL', position: 9 }
        ];

        const defaultThemeColors = {
            vision: '#ff8f00',
            effort: '#86b4f0',
            systems: '#72cb44',
            practice: '#7f31a4',
            attitude: '#f032e6',
            overall: '#ffd93d'
        };

        const currentThemeColors = config.themeColors || defaultThemeColors;

        elementsToDisplay.forEach(element => {
            const schoolScore = schoolData[element.key];
            const nationalScore = comparisonData[element.key];

            const card = document.createElement('div');
            card.className = 'vespa-score-card';
            card.id = `score-card-${element.key}`;
            card.dataset.position = element.position; // Store position for ordering

            let percentageDiffText = '';
            let arrow = '';
            let arrowClass = '';

            if (nationalScore !== null && typeof nationalScore !== 'undefined' && nationalScore > 0 && schoolScore !== null && typeof schoolScore !== 'undefined') {
                const diff = ((schoolScore - nationalScore) / nationalScore) * 100;
                arrow = diff >= 0 ? '↑' : '↓';
                arrowClass = diff >= 0 ? 'up' : 'down';
                percentageDiffText = `${diff.toFixed(1)}%`;
            } else if (schoolScore !== null && typeof schoolScore !== 'undefined') {
                if (nationalScore === 0) {
                    percentageDiffText = 'Global Avg 0';
                } else {
                    percentageDiffText = 'Global N/A';
                }
            }

            const scoreToDisplay = (typeof schoolScore === 'number') ? schoolScore.toFixed(1) : 'N/A';
            const nationalScoreToDisplay = (typeof nationalScore === 'number') ? nationalScore.toFixed(1) : 'N/A';

            card.innerHTML = `
                <button class="advanced-stats-btn" data-element="${element.key}" data-cycle="${cycle}" title="Advanced Statistics">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 3v18h18M9 17V9m4 8V5m4 12V11"/>
                    </svg>
                </button>
                <h3>${element.name}</h3>
                <div class="score-value">${scoreToDisplay}</div>
                <div class="national-comparison">
                    ${comparisonLabel}: ${nationalScoreToDisplay} <span class="arrow ${arrowClass}">${arrow}</span> ${percentageDiffText}
                </div>
            `;
            
            // Store the card temporarily, we'll add them in the correct order later
            window.tempScoreCards = window.tempScoreCards || {};
            window.tempScoreCards[element.key] = card;
        });
    }

    // --- Advanced Statistics Functions ---
    function calculateStatistics(values) {
        if (!values || values.length === 0) {
            return null;
        }

        // Sort values for percentile calculations
        const sorted = values.slice().sort((a, b) => a - b);
        const n = sorted.length;

        // Calculate mean
        const mean = values.reduce((sum, val) => sum + val, 0) / n;

        // Calculate standard deviation
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // Calculate percentiles
        const percentile = (p) => {
            const index = (p / 100) * (n - 1);
            const lower = Math.floor(index);
            const upper = Math.ceil(index);
            const weight = index % 1;
            return sorted[lower] * (1 - weight) + sorted[upper] * weight;
        };

        // Calculate skewness (simplified)
        const skewness = n > 2 ? 
            (values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n) : 0;

        // Calculate confidence intervals (95%)
        const confidenceInterval = 1.96 * (stdDev / Math.sqrt(n));

        return {
            mean: parseFloat(mean.toFixed(2)),
            std_dev: parseFloat(stdDev.toFixed(2)),
            min: Math.min(...values),
            max: Math.max(...values),
            percentile_25: parseFloat(percentile(25).toFixed(2)),
            percentile_50: parseFloat(percentile(50).toFixed(2)),
            percentile_75: parseFloat(percentile(75).toFixed(2)),
            confidence_interval_lower: parseFloat((mean - confidenceInterval).toFixed(2)),
            confidence_interval_upper: parseFloat((mean + confidenceInterval).toFixed(2)),
            skewness: parseFloat(skewness.toFixed(3)),
            count: n
        };
    }

    function calculateSchoolStatistics(schoolResults, cycle, elementKey) {
        const fieldMappings = {
            cycle1: { 
                vision: 'field_155', effort: 'field_156', systems: 'field_157', 
                practice: 'field_158', attitude: 'field_159', overall: 'field_160' 
            },
            cycle2: { 
                vision: 'field_161', effort: 'field_162', systems: 'field_163', 
                practice: 'field_164', attitude: 'field_165', overall: 'field_166' 
            },
            cycle3: { 
                vision: 'field_167', effort: 'field_168', systems: 'field_169', 
                practice: 'field_170', attitude: 'field_171', overall: 'field_172' 
            }
        };

        const cycleFields = fieldMappings[`cycle${cycle}`];
        if (!cycleFields || !cycleFields[elementKey]) {
            return null;
        }

        const fieldKey = cycleFields[elementKey] + '_raw';
        const values = [];

        schoolResults.forEach(record => {
            const value = parseFloat(record[fieldKey]);
            if (!isNaN(value)) {
                values.push(value);
            }
        });

        return calculateStatistics(values);
    }

    async function handleAdvancedStatsClick(event) {
        const button = event.currentTarget;
        const elementKey = button.dataset.element;
        const cycle = parseInt(button.dataset.cycle);

        log(`Opening advanced stats for ${elementKey} - Cycle ${cycle}`);

        // Show loading state
        showStatsPanel(elementKey, cycle, true);

        try {
            // Get current school results (filtered)
            const activeFilters = getActiveFilters();
            let schoolResults = [];
            
            const staffAdminId = await getStaffAdminRecordIdByEmail(loggedInUserEmail);
            if (staffAdminId) {
                const filters = [{
                    field: 'field_439',
                    operator: 'is',
                    value: staffAdminId
                }, ...activeFilters];
                
                schoolResults = await fetchDataFromKnack(objectKeys.vespaResults, filters);
            }

            // Calculate school statistics
            const schoolStats = calculateSchoolStatistics(schoolResults, cycle, elementKey);

            // Fetch national statistics
            let nationalStats = null;
            if (objectKeys.nationalBenchmarkData) {
                const nationalData = await fetchDataFromKnack(
                    objectKeys.nationalBenchmarkData, 
                    [], 
                    { rows_per_page: 1, sort_field: 'field_3307', sort_order: 'desc' }
                );

                if (nationalData && nationalData.length > 0) {
                    const statsFieldMap = {
                        1: 'field_3429',
                        2: 'field_3430',
                        3: 'field_3421'  // Note: You mentioned field_3421 for cycle 3
                    };
                    
                    const statsField = statsFieldMap[cycle];
                    if (statsField && nationalData[0][statsField + '_raw']) {
                        try {
                            const allStats = JSON.parse(nationalData[0][statsField + '_raw']);
                            // Get stats for the specific element (capitalize first letter)
                            const elementName = elementKey.charAt(0).toUpperCase() + elementKey.slice(1);
                            nationalStats = allStats[elementName];
                        } catch (e) {
                            errorLog(`Failed to parse national statistics for cycle ${cycle}:`, e);
                        }
                    }
                }
            }

            // Update panel with data
            updateStatsPanel(elementKey, cycle, schoolStats, nationalStats);

        } catch (error) {
            errorLog("Error loading advanced statistics:", error);
            updateStatsPanel(elementKey, cycle, null, null, error.message);
        }
    }

    function showStatsPanel(elementKey, cycle, isLoading = false) {
        // Create panel HTML if it doesn't exist
        let overlay = document.querySelector('.stats-panel-overlay');
        let panel = document.querySelector('.stats-panel');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'stats-panel-overlay';
            overlay.addEventListener('click', hideStatsPanel);
            document.body.appendChild(overlay);
        }
        
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'stats-panel';
            document.body.appendChild(panel);
        }

        // Set initial content
        const elementColors = {
            vision: 'var(--vision-color)',
            effort: 'var(--effort-color)',
            systems: 'var(--systems-color)',
            practice: 'var(--practice-color)',
            attitude: 'var(--attitude-color)',
            overall: 'var(--overall-color)'
        };

        const elementName = elementKey.charAt(0).toUpperCase() + elementKey.slice(1);
        const color = elementColors[elementKey] || 'var(--accent-primary)';

        panel.innerHTML = `
            <div class="stats-panel-header">
                <div class="stats-panel-title">
                    <h3>
                        Advanced Statistics
                        <span class="stats-element-badge" style="background-color: ${color}">
                            ${elementName} - Cycle ${cycle}
                        </span>
                    </h3>
                    <div style="display: flex; align-items: center;">
                        <button class="stats-info-btn" onclick="showStatsInfoModal()">
                            i
                        </button>
                        <button class="stats-close-btn" onclick="hideStatsPanel()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            <div class="stats-panel-content">
                ${isLoading ? '<div class="stats-loading"><div class="spinner"></div><p>Calculating statistics...</p></div>' : ''}
            </div>
        `;

        // Show panel with animation
        requestAnimationFrame(() => {
            overlay.classList.add('active');
            panel.classList.add('active');
        });
    }

    function updateStatsPanel(elementKey, cycle, schoolStats, nationalStats, error = null) {
        const panel = document.querySelector('.stats-panel');
        const content = panel.querySelector('.stats-panel-content');
        
        if (error) {
            content.innerHTML = `
                <div class="stats-section">
                    <p style="color: var(--accent-danger); text-align: center;">
                        Error loading statistics: ${error}
                    </p>
                </div>
            `;
            return;
        }

        if (!schoolStats && !nationalStats) {
            content.innerHTML = `
                <div class="stats-section">
                    <p style="color: var(--text-muted); text-align: center;">
                        No statistical data available.
                    </p>
                </div>
            `;
            return;
        }

        // Generate comparison HTML
        content.innerHTML = `
            <div class="stats-comparison">
                ${schoolStats ? generateStatsSection('Your School', schoolStats, nationalStats, 'school') : ''}
                ${nationalStats ? generateStatsSection('Global Benchmark', nationalStats, null, 'national') : ''}
                ${schoolStats && nationalStats ? generateInsights(schoolStats, nationalStats, elementKey) : ''}
            </div>
        `;

        // Add box plot visualization if both datasets exist
        if (schoolStats && nationalStats) {
            // You could add a box plot here using Chart.js or D3.js
        }
    }

    function generateStatsSection(title, stats, compareStats, type) {
        const formatDiff = (value, compareValue) => {
            if (!compareStats || compareValue === undefined) return '';
            const diff = value - compareValue;
            const percentage = compareValue !== 0 ? (diff / compareValue * 100).toFixed(1) : 0;
            const isPositive = diff > 0;
            const className = isPositive ? 'positive' : 'negative';
            const sign = isPositive ? '+' : '';
            return '<span class="stat-diff ' + className + '">' + sign + percentage + '%</span>';
        };

        let meanDiff = '';
        let stdDevDiff = '';
        
        if (compareStats && typeof compareStats.mean === 'number') {
            meanDiff = formatDiff(stats.mean, compareStats.mean);
        }
        
        if (compareStats && typeof compareStats.std_dev === 'number') {
            stdDevDiff = formatDiff(stats.std_dev, compareStats.std_dev);
        }

        return `
            <div class="stats-section">
                <h4>${title}</h4>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-label">Mean</div>
                        <div class="stat-value">
                            ${stats.mean}
                            ${meanDiff}
                        </div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Standard Deviation</div>
                        <div class="stat-value">
                            ${stats.std_dev}
                            ${stdDevDiff}
                        </div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">25th Percentile</div>
                        <div class="stat-value">${stats.percentile_25}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Median (50th)</div>
                        <div class="stat-value">${stats.percentile_50}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">75th Percentile</div>
                        <div class="stat-value">${stats.percentile_75}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Sample Size</div>
                        <div class="stat-value">${stats.count.toLocaleString()}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Range</div>
                        <div class="stat-value">${stats.min} - ${stats.max}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Confidence Interval</div>
                        <div class="stat-value" style="font-size: 1rem;">
                            ${stats.confidence_interval_lower} - ${stats.confidence_interval_upper}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }


    function generateInsights(schoolStats, nationalStats, elementKey) {
        const insights = [];
        
        // Compare mean
        if (schoolStats.mean > nationalStats.mean) {
            const diff = ((schoolStats.mean - nationalStats.mean) / nationalStats.mean * 100).toFixed(1);
            insights.push({
                type: 'success',
                text: `Your school's average is ${diff}% above the global benchmark`
            });
        } else if (schoolStats.mean < nationalStats.mean) {
            const diff = ((nationalStats.mean - schoolStats.mean) / nationalStats.mean * 100).toFixed(1);
            insights.push({
                type: 'warning',
                text: `Your school's average is ${diff}% below the global benchmark`
            });
        }

        // Variability comparison
        if (schoolStats.std_dev > nationalStats.std_dev * 1.2) {
            insights.push({
                type: 'info',
                text: 'Higher variability than global benchmark - consider targeted interventions'
            });
        } else if (schoolStats.std_dev < nationalStats.std_dev * 0.8) {
            insights.push({
                type: 'success',
                text: 'More consistent scores than global benchmark'
            });
        }

        // Percentile position
        if (schoolStats.mean > nationalStats.percentile_75) {
            insights.push({
                type: 'success',
                text: 'Performance in top quartile globally'
            });
        } else if (schoolStats.mean < nationalStats.percentile_25) {
            insights.push({
                type: 'warning',
                text: 'Performance in bottom quartile globally'
            });
        }

        // Sample size
        if (schoolStats.count < 30) {
            insights.push({
                type: 'info',
                text: 'Small sample size - interpret with caution'
            });
        }

        return `
            <div class="stats-insights">
                <h5>Key Insights</h5>
                ${insights.map(insight => `
                    <div class="insight-item">
                        <div class="insight-icon ${insight.type}">
                            ${insight.type === 'success' ? '✓' : insight.type === 'warning' ? '!' : 'i'}
                        </div>
                        <div class="insight-text">${insight.text}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Make hideStatsPanel globally accessible
    window.hideStatsPanel = function() {
        const overlay = document.querySelector('.stats-panel-overlay');
        const panel = document.querySelector('.stats-panel');
        
        if (overlay) overlay.classList.remove('active');
        if (panel) panel.classList.remove('active');
        
        // Remove elements after animation
        setTimeout(() => {
            if (overlay && !overlay.classList.contains('active')) {
                overlay.remove();
            }
            if (panel && !panel.classList.contains('active')) {
                panel.remove();
            }
        }, 400);
    };

    // Stats Info Modal Functions
    window.showStatsInfoModal = function() {
        // Create modal if it doesn't exist
        let modal = document.querySelector('.stats-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'stats-info-modal';
            modal.innerHTML = `
                <div class="stats-info-content">
                    <div class="stats-info-header">
                        <h3>Understanding Your Statistics</h3>
                        <button class="stats-info-close" onclick="hideStatsInfoModal()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="stats-info-body">
                        <div class="stats-term">
                            <h4>Mean (Average)</h4>
                            <p>The average score calculated by adding all scores and dividing by the number of responses. This gives you the central tendency of your data.</p>
                            <div class="example">Example: If your school's mean is 6.2 and the national mean is 5.8, your students are performing above the national average.</div>
                        </div>
                        
                        <div class="stats-term">
                            <h4>Standard Deviation</h4>
                            <p>Measures how spread out the scores are from the average. A lower value means scores are more consistent, while a higher value indicates more variability.</p>
                            <div class="example">Example: A standard deviation of 1.5 means most scores fall within 1.5 points of the average.</div>
                        </div>
                        
                        <div class="stats-term">
                            <h4>Percentiles (25th, 50th, 75th)</h4>
                            <p>Shows the score below which a certain percentage of students fall. The 50th percentile is the median.</p>
                            <div class="example">Example: A 75th percentile of 8 means 75% of students scored 8 or below.</div>
                        </div>
                        
                        <div class="stats-term">
                            <h4>Confidence Interval</h4>
                            <p>The range where we're 95% confident the true average lies. Narrower intervals indicate more precise estimates.</p>
                            <div class="example">Example: A confidence interval of 5.8-6.2 means we're 95% confident the true average is between these values.</div>
                        </div>
                        
                        <div class="stats-term">
                            <h4>Sample Size</h4>
                            <p>The number of students included in the calculation. Larger sample sizes generally provide more reliable statistics.</p>
                            <div class="example">Note: Results based on fewer than 30 students should be interpreted with caution.</div>
                        </div>
                        
                        <div class="stats-term">
                            <h4>Range (Min-Max)</h4>
                            <p>Shows the lowest and highest scores in your data. A wider range indicates more diverse performance levels.</p>
                            <div class="example">Example: A range of 2-10 shows significant variation in student responses.</div>
                        </div>
                        
                        <div class="stats-term">
                            <h4>Percentage Differences</h4>
                            <p>Green percentages show where your school exceeds national averages, while red indicates areas below national performance.</p>
                            <div class="example">Tip: Focus improvement efforts on areas with negative percentages while maintaining strengths.</div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add click outside to close
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    hideStatsInfoModal();
                }
            });
        }
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    };

    window.hideStatsInfoModal = function() {
        const modal = document.querySelector('.stats-info-modal');
        if (modal) {
            modal.classList.remove('active');
            // Remove after animation
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    };

    // QLA Info Modal Functions
    window.showQLAInfoModal = function() {
        let modal = document.querySelector('.qla-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'qla-info-modal';
            modal.innerHTML = `
                <div class="qla-info-content">
                    <div class="qla-info-header">
                        <h3>Understanding QLA Statistics</h3>
                        <button class="qla-info-close" onclick="window.hideQLAInfoModal()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="qla-info-body">
                        <div class="qla-term">
                            <h4>Average Score</h4>
                            <p>The mean score for this question on a scale of 1-5, where:</p>
                            <ul style="margin-left: 1.5rem; margin-top: 0.5rem;">
                                <li>1 = Strongly Disagree</li>
                                <li>2 = Disagree</li>
                                <li>3 = Neutral</li>
                                <li>4 = Agree</li>
                                <li>5 = Strongly Agree</li>
                            </ul>
                            <div class="example">Example: A score of 4.11 means students generally agree with this statement.</div>
                        </div>
                        
                        <div class="qla-term">
                            <h4>Responses</h4>
                            <p>The total number of students who answered this specific question. Not all students may answer every question, so this number can vary between questions.</p>
                            <div class="example">Example: "9 responses" means only 9 students provided an answer to this particular question.</div>
                        </div>
                        
                        <div class="qla-term">
                            <h4>Standard Deviation (Std Dev)</h4>
                            <p>Measures how much student responses vary from the average. A lower value means students generally agree with each other, while a higher value indicates more diverse opinions.</p>
                            <div class="example">Example: A Std Dev of 0.87 suggests most students gave similar answers, while 1.5+ would indicate more disagreement.</div>
                        </div>
                        
                        <div class="qla-term">
                            <h4>Mode</h4>
                            <p>The most frequently selected answer. This shows you what the majority of students chose for this question.</p>
                            <div class="example">Example: If the mode is "5", it means more students selected "Strongly Agree" than any other option.</div>
                        </div>
                        
                        <div class="qla-term">
                            <h4>Mini Bar Chart</h4>
                            <p>Shows the distribution of responses across all 5 answer choices. Taller bars indicate more students selected that option.</p>
                            <div class="example">This helps you quickly see if responses are clustered around certain values or spread out.</div>
                        </div>
                        
                        <div class="qla-term">
                            <h4>Color Coding</h4>
                            <p>Questions are color-coded based on their average score:</p>
                            <ul style="margin-left: 1.5rem; margin-top: 0.5rem;">
                                <li><span style="color: #10b981;">● Green (4.0+)</span> - Excellent performance</li>
                                <li><span style="color: #3b82f6;">● Blue (3.0-3.9)</span> - Good performance</li>
                                <li><span style="color: #f59e0b;">● Orange (2.0-2.9)</span> - Average, needs attention</li>
                                <li><span style="color: #ef4444;">● Red (Below 2.0)</span> - Poor, urgent attention needed</li>
                            </ul>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add click outside to close
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    window.hideQLAInfoModal();
                }
            });
        }
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    };

    window.hideQLAInfoModal = function() {
        const modal = document.querySelector('.qla-info-modal');
        if (modal) {
            modal.classList.remove('active');
            // Remove after animation
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    };

    // Insight Info Modal Functions
    window.showInsightInfoModal = function(insightId) {
        // Get the insight data
        const insight = window.insightsData?.find(i => i.id === insightId);
        if (!insight) return;
        
        // Define detailed explanations for each insight
        const insightExplanations = {
            'growth_mindset': {
                title: 'Growth Mindset',
                description: 'Measures students\' belief that intelligence and abilities can be developed through effort and learning.',
                why: 'Students with a growth mindset are more likely to persist through challenges, embrace feedback, and achieve better academic outcomes.',
                questions: [
                    'Q5: "No matter who you are, you can change your intelligence a lot"',
                    'Q26: "Your intelligence is something about you that you can change very much"'
                ],
                interpretation: {
                    excellent: 'Most students believe they can improve their abilities - excellent foundation for learning',
                    good: 'Good growth mindset culture, but room for improvement',
                    average: 'Mixed beliefs about ability to improve - consider growth mindset interventions',
                    poor: 'Fixed mindset prevalent - urgent need for growth mindset education'
                }
            },
            'academic_momentum': {
                title: 'Academic Momentum',
                description: 'Captures students\' intrinsic drive, engagement with learning, and commitment to excellence.',
                why: 'Students with high academic momentum are self-motivated and more likely to sustain performance through challenges.',
                questions: [
                    'Q14: "I strive to achieve the goals I set for myself"',
                    'Q16: "I enjoy learning new things"',
                    'Q17: "I\'m not happy unless my work is the best it can be"',
                    'Q9: "I am a hard working student"'
                ],
                interpretation: {
                    excellent: 'Students show strong drive and engagement - maintain this momentum',
                    good: 'Good levels of motivation, but could be strengthened',
                    average: 'Moderate engagement - explore ways to boost intrinsic motivation',
                    poor: 'Low academic drive - investigate underlying causes and provide support'
                }
            },
            'study_effectiveness': {
                title: 'Study Effectiveness',
                description: 'Measures adoption of evidence-based study techniques that improve learning and retention.',
                why: 'Effective study techniques significantly improve exam performance and long-term retention of material.',
                questions: [
                    'Q7: "I test myself on important topics until I remember them"',
                    'Q12: "I spread out my revision, rather than cramming at the last minute"',
                    'Q15: "I summarise important information in diagrams, tables or lists"'
                ],
                interpretation: {
                    excellent: 'Students use proven study techniques - likely to achieve strong results',
                    good: 'Good study habits, but some techniques could be improved',
                    average: 'Mixed study practices - provide training on effective techniques',
                    poor: 'Poor study habits prevalent - urgent need for study skills training'
                }
            },
            'exam_confidence': {
                title: 'Exam Confidence',
                description: 'Students\' belief in their ability to achieve their potential in final exams.',
                why: 'Confidence correlates with performance - students who believe they can succeed are more likely to do so.',
                questions: [
                    'Outcome Q: "I am confident I will achieve my potential in my final exams"'
                ],
                interpretation: {
                    excellent: 'High confidence levels - students believe in their ability to succeed',
                    good: 'Good confidence, but some students need reassurance',
                    average: 'Mixed confidence - identify and support less confident students',
                    poor: 'Low confidence widespread - investigate causes and provide support'
                }
            },
            'organization_skills': {
                title: 'Organization Skills',
                description: 'Measures students\' ability to plan, organize, and manage their academic responsibilities.',
                why: 'Well-organized students are less stressed, more productive, and better able to balance multiple demands.',
                questions: [
                    'Q2: "I plan and organise my time to get my work done"',
                    'Q22: "My books/files are organised"',
                    'Q11: "I always meet deadlines"'
                ],
                interpretation: {
                    excellent: 'Students are highly organized - a key success factor',
                    good: 'Good organizational skills, minor improvements possible',
                    average: 'Mixed organization - provide tools and training',
                    poor: 'Poor organization widespread - implement organizational support systems'
                }
            },
            'resilience_factor': {
                title: 'Resilience',
                description: 'Students\' ability to bounce back from setbacks and maintain a positive outlook.',
                why: 'Resilient students persist through challenges and learn from failures rather than being defeated by them.',
                questions: [
                    'Q13: "I don\'t let a poor test/assessment result get me down for too long"',
                    'Q8: "I have a positive view of myself"',
                    'Q27: "I like hearing feedback about how I can improve"'
                ],
                interpretation: {
                    excellent: 'High resilience - students bounce back well from setbacks',
                    good: 'Good resilience, but some students need support',
                    average: 'Mixed resilience - build culture of learning from mistakes',
                    poor: 'Low resilience - implement resilience-building programs'
                }
            },
            'stress_management': {
                title: 'Stress Management',
                description: 'Students\' ability to handle academic pressure and control exam nerves.',
                why: 'Effective stress management improves performance, wellbeing, and prevents burnout.',
                questions: [
                    'Q20: "I feel I can cope with the pressure at school/college/University"',
                    'Q28: "I can control my nerves in tests/practical assessments"'
                ],
                interpretation: {
                    excellent: 'Students manage stress well - maintain supportive environment',
                    good: 'Good stress management, but monitor for changes',
                    average: 'Some students struggling - provide stress management resources',
                    poor: 'High stress levels - urgent intervention needed'
                }
            },
            'active_learning': {
                title: 'Active Learning',
                description: 'Engagement with active learning techniques that deepen understanding and retention.',
                why: 'Active learning techniques are proven to be more effective than passive studying.',
                questions: [
                    'Q7: "I test myself on important topics until I remember them"',
                    'Q23: "When preparing for a test/exam I teach someone else the material"',
                    'Q19: "When revising I mix different kinds of topics/subjects in one study session"'
                ],
                interpretation: {
                    excellent: 'Strong use of active learning - excellent practice',
                    good: 'Good active learning, could expand techniques',
                    average: 'Some active learning - promote more techniques',
                    poor: 'Passive learning dominant - teach active strategies'
                }
            },
            'support_readiness': {
                title: 'Support Readiness',
                description: 'Students\' perception of having adequate support to achieve their goals.',
                why: 'Students who feel supported are more likely to seek help when needed and achieve better outcomes.',
                questions: [
                    'Outcome Q: "I have the support I need to achieve this year"'
                ],
                interpretation: {
                    excellent: 'Students feel well-supported - maintain this environment',
                    good: 'Good support perception, but some gaps exist',
                    average: 'Mixed feelings about support - investigate specific needs',
                    poor: 'Students feel unsupported - review support systems urgently'
                }
            },
            'time_management': {
                title: 'Time Management',
                description: 'Students\' ability to effectively plan and use their time for academic work.',
                why: 'Good time management reduces stress, improves work quality, and enables better work-life balance.',
                questions: [
                    'Q2: "I plan and organise my time to get my work done"',
                    'Q4: "I complete all my homework on time"',
                    'Q11: "I always meet deadlines"'
                ],
                interpretation: {
                    excellent: 'Excellent time management skills across cohort',
                    good: 'Good time management, minor improvements possible',
                    average: 'Mixed time management - provide planning tools',
                    poor: 'Poor time management - implement time management training'
                }
            },
            'academic_confidence': {
                title: 'Academic Confidence',
                description: 'Students\' belief in their academic abilities and positive self-perception.',
                why: 'Academic confidence is a strong predictor of achievement and willingness to take on challenges.',
                questions: [
                    'Q10: "I am confident in my academic ability"',
                    'Q8: "I have a positive view of myself"'
                ],
                interpretation: {
                    excellent: 'High academic confidence - students believe in themselves',
                    good: 'Good confidence levels, some students need boosting',
                    average: 'Mixed confidence - identify and support less confident students',
                    poor: 'Low academic confidence - build success experiences'
                }
            },
            'revision_readiness': {
                title: 'Revision Readiness',
                description: 'Students\' perception of being equipped to handle revision and study challenges.',
                why: 'Feeling prepared for revision reduces anxiety and improves study effectiveness.',
                questions: [
                    'Outcome Q: "I feel equipped to face the study and revision challenges this year"'
                ],
                interpretation: {
                    excellent: 'Students feel well-prepared for revision challenges',
                    good: 'Good preparation, but some students need support',
                    average: 'Mixed readiness - provide revision skills training',
                    poor: 'Students feel unprepared - urgent revision support needed'
                }
            }
        };
        
        const explanation = insightExplanations[insightId] || {};
        const percentage = insight.data?.percent || 0;
        let interpretationKey = 'poor';
        if (percentage >= 80) interpretationKey = 'excellent';
        else if (percentage >= 60) interpretationKey = 'good';
        else if (percentage >= 40) interpretationKey = 'average';
        
        let modal = document.querySelector('.insight-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'insight-info-modal';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="insight-info-content">
                <div class="insight-info-header">
                    <h3>${explanation.title || insight.title}</h3>
                    <button class="insight-info-close" onclick="window.hideInsightInfoModal()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="insight-info-body">
                    <div class="current-score">
                        <span class="score-label">Current Score:</span>
                        <span class="score-value ${interpretationKey}">${percentage.toFixed(1)}%</span>
                        <span class="score-sample">(n = ${insight.data?.n || 0})</span>
                    </div>
                    
                    <div class="insight-section">
                        <h4>What This Measures</h4>
                        <p>${explanation.description || 'This insight helps understand student readiness and areas for improvement.'}</p>
                    </div>
                    
                    <div class="insight-section">
                        <h4>Why It Matters</h4>
                        <p>${explanation.why || 'This metric provides valuable insights into student success factors.'}</p>
                    </div>
                    
                    <div class="insight-section">
                        <h4>Questions Included</h4>
                        <ul class="questions-list">
                            ${(explanation.questions || []).map(q => `<li>${q}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div class="insight-section">
                        <h4>Your Score Interpretation</h4>
                        <p class="interpretation ${interpretationKey}">
                            ${explanation.interpretation?.[interpretationKey] || 'Continue monitoring this metric and provide appropriate support.'}
                        </p>
                    </div>
                    
                    <div class="insight-section">
                        <h4>Score Ranges</h4>
                        <div class="score-ranges">
                            <div class="range excellent">80-100%: Excellent</div>
                            <div class="range good">60-79%: Good</div>
                            <div class="range average">40-59%: Needs Attention</div>
                            <div class="range poor">0-39%: Urgent Action Required</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add click outside to close
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                window.hideInsightInfoModal();
            }
        });
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    };
    
    window.hideInsightInfoModal = function() {
        const modal = document.querySelector('.insight-info-modal');
        if (modal) {
            modal.classList.remove('active');
            // Remove after animation
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    };
    
    // QLA Insights Info Modal Functions
    window.showQLAInsightsInfoModal = function() {
        let modal = document.querySelector('.qla-insights-info-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'qla-insights-info-modal';
            modal.innerHTML = `
                <div class="qla-insights-info-content">
                    <div class="qla-insights-info-header">
                        <h3>Understanding VESPA Questionnaire Insights</h3>
                        <button class="qla-insights-info-close" onclick="window.hideQLAInsightsInfoModal()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="qla-insights-info-body">
                        <div class="qla-insights-section">
                            <h4>How Insights Are Calculated</h4>
                            <p>Each insight shows the <strong>percentage of students who selected 4 (Agree) or 5 (Strongly Agree)</strong> on the 1-5 scale. This focuses on positive agreement rather than average scores.</p>
                        </div>
                        
                        <div class="qla-insights-section">
                            <h4>For Multi-Question Insights</h4>
                            <p>When an insight combines multiple questions (like Growth Mindset with Q5 & Q26), the percentage is calculated across <strong>ALL responses to ALL questions</strong> in the group.</p>
                            
                            <div class="calculation-example">
                                <strong>Example: Growth Mindset (Q5 & Q26)</strong><br/>
                                Q5: 40 students answered 4 or 5 out of 80 responses<br/>
                                Q26: 35 students answered 4 or 5 out of 75 responses<br/>
                                Total: 75 "agree" responses out of 155 total responses<br/>
                                Result: (75/155) × 100 = <strong>48.4%</strong>
                            </div>
                        </div>
                        
                        <div class="qla-insights-section">
                            <h4>The Response Scale</h4>
                            <ul class="scale-list">
                                <li>1 = Strongly Disagree</li>
                                <li>2 = Disagree</li>
                                <li>3 = Neutral</li>
                                <li class="positive">4 = Agree ✓ (counted as positive)</li>
                                <li class="positive">5 = Strongly Agree ✓ (counted as positive)</li>
                            </ul>
                        </div>
                        
                        <div class="qla-insights-section">
                            <h4>What the Percentages Mean</h4>
                            <div class="score-ranges">
                                <div class="range excellent">80-100%: Excellent</div>
                                <div class="range good">60-79%: Good</div>
                                <div class="range average">40-59%: Needs Attention</div>
                                <div class="range poor">0-39%: Urgent Action Required</div>
                            </div>
                            <ul style="margin-top: 1rem;">
                                <li><strong>Excellent:</strong> Most students agree with these positive statements</li>
                                <li><strong>Good:</strong> Majority agree but room for improvement</li>
                                <li><strong>Needs Attention:</strong> Mixed responses, intervention recommended</li>
                                <li><strong>Urgent Action Required:</strong> Most students disagree or are neutral</li>
                            </ul>
                        </div>
                        
                        <div class="qla-insights-section">
                            <h4>The "n" Value</h4>
                            <ul>
                                <li><strong>For single questions:</strong> Total number of students who answered that question</li>
                                <li><strong>For multiple questions:</strong> Average number of responses per question in the group</li>
                            </ul>
                            <p style="margin-top: 0.5rem; font-style: italic; color: var(--text-muted);">
                                This helps you understand the sample size and reliability of each insight.
                            </p>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add click outside to close
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    window.hideQLAInsightsInfoModal();
                }
            });
        }
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('active');
        });
    };
    
    window.hideQLAInsightsInfoModal = function() {
        const modal = document.querySelector('.qla-insights-info-modal');
        if (modal) {
            modal.classList.remove('active');
            // Remove after animation
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
    };

    let vespaDistributionChartInstances = {}; // To store multiple chart instances
    
    function renderCombinedVespaDisplay(cycle, nationalDistributions) {
        const container = document.getElementById('vespa-combined-container');
        if (!container) {
            errorLog("VESPA combined container not found");
            return;
        }
        
        // Clear previous content
        container.innerHTML = '';
        
        // Get all the temporary elements
        const scoreCards = window.tempScoreCards || {};
        const chartWrappers = window.tempChartWrappers || {};
        
        // Define the order and mapping
        const elementOrder = [
            { type: 'card', key: 'vision', position: 1 },
            { type: 'card', key: 'effort', position: 2 },
            { type: 'card', key: 'systems', position: 3 },
            { type: 'chart', key: 'vision', position: 4 },
            { type: 'chart', key: 'effort', position: 5 },
            { type: 'chart', key: 'systems', position: 6 },
            { type: 'card', key: 'practice', position: 7 },
            { type: 'card', key: 'attitude', position: 8 },
            { type: 'card', key: 'overall', position: 9 },
            { type: 'chart', key: 'practice', position: 10 },
            { type: 'chart', key: 'attitude', position: 11 },
            { type: 'chart', key: 'overall', position: 12 }
        ];
        
        // Add elements in order
        elementOrder.forEach(item => {
            if (item.type === 'card' && scoreCards[item.key]) {
                container.appendChild(scoreCards[item.key]);
            } else if (item.type === 'chart' && chartWrappers[item.key]) {
                container.appendChild(chartWrappers[item.key].wrapper);
            }
        });
        
        // Now create all the charts after DOM elements are in place
        Object.keys(chartWrappers).forEach(key => {
            const chartData = chartWrappers[key];
            const canvasId = `${key}-distribution-chart`;
            
            createSingleHistogram(
                canvasId,
                chartData.title,
                chartData.scoreDistribution,
                chartData.nationalAverage,
                chartData.color,
                cycle,
                chartData.key,
                nationalDistributions,
                chartData.comparisonLabel
            );
        });
        
        // Add event listeners for advanced stats buttons
        container.querySelectorAll('.advanced-stats-btn').forEach(btn => {
            btn.addEventListener('click', handleAdvancedStatsClick);
        });
        
        // Clean up temporary storage
        window.tempScoreCards = null;
        window.tempChartWrappers = null;
        
        log("Combined VESPA display rendered successfully");
    }

    function renderDistributionCharts(schoolResults, comparisonAverages, themeColorsConfig, cycle, nationalDistributions, comparisonLabel = 'Global') {
        log(`Creating distribution charts for Cycle ${cycle}.`);

        // VESPA elements and their corresponding field prefixes in Object_10 for historical data
        const vespaElements = [
            { name: 'Vision', key: 'vision', color: themeColorsConfig?.vision || '#ff8f00', fieldCycle1: 'field_155', fieldCycle2: 'field_161', fieldCycle3: 'field_167', position: 4 },
            { name: 'Effort', key: 'effort', color: themeColorsConfig?.effort || '#86b4f0', fieldCycle1: 'field_156', fieldCycle2: 'field_162', fieldCycle3: 'field_168', position: 5 },
            { name: 'Systems', key: 'systems', color: themeColorsConfig?.systems || '#72cb44', fieldCycle1: 'field_157', fieldCycle2: 'field_163', fieldCycle3: 'field_169', position: 6 },
            { name: 'Practice', key: 'practice', color: themeColorsConfig?.practice || '#7f31a4', fieldCycle1: 'field_158', fieldCycle2: 'field_164', fieldCycle3: 'field_170', position: 10 },
            { name: 'Attitude', key: 'attitude', color: themeColorsConfig?.attitude || '#f032e6', fieldCycle1: 'field_159', fieldCycle2: 'field_165', fieldCycle3: 'field_171', position: 11 },
            { name: 'Overall', key: 'overall', color: themeColorsConfig?.overall || '#ffd93d', fieldCycle1: 'field_160', fieldCycle2: 'field_166', fieldCycle3: 'field_172', position: 12 }
        ];

        window.tempChartWrappers = window.tempChartWrappers || {};

        vespaElements.forEach(element => {
            const scoreDistribution = Array(11).fill(0); // For scores 0-10
            let scoreFieldKey = element[`fieldCycle${cycle}`] + '_raw';

            if (!schoolResults || schoolResults.length === 0) {
                log(`No school results to process for ${element.name} distribution.`);
            } else {
                schoolResults.forEach(record => {
                    const score = parseFloat(record[scoreFieldKey]);
                    if (!isNaN(score) && score >= 0 && score <= 10) {
                        scoreDistribution[Math.round(score)]++; // Round score in case of decimals, though they should be whole numbers
                    }
                });
            }
            
            const nationalAverageForElement = comparisonAverages ? comparisonAverages[element.key] : null;
            const canvasId = `${element.key}-distribution-chart`;
            let chartTitle = `${element.name} Score Distribution - Cycle ${cycle}`;

            log(`For ${element.name} Distribution - ${comparisonLabel} Avg: ${nationalAverageForElement}`);

            // Create chart wrapper element
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'chart-wrapper';
            chartWrapper.id = `chart-wrapper-${element.key}`;
            chartWrapper.dataset.position = element.position;
            
            const canvas = document.createElement('canvas');
            canvas.id = canvasId;
            chartWrapper.appendChild(canvas);
            
            // Store the wrapper temporarily
            window.tempChartWrappers[element.key] = {
                wrapper: chartWrapper,
                scoreDistribution,
                nationalAverage: nationalAverageForElement,
                color: element.color,
                title: chartTitle,
                key: element.key,
                comparisonLabel: comparisonLabel
            };
        });
        
        // Now combine everything in the right order
        renderCombinedVespaDisplay(cycle, nationalDistributions);
    }

    function createSingleHistogram(canvasId, title, schoolScoreDistribution, nationalAverageScore, color, cycle, elementKey, nationalDistributions, comparisonLabel = 'Global') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            errorLog(`Canvas element ${canvasId} not found for histogram.`);
            return;
        }
        const ctx = canvas.getContext('2d');

        // Destroy previous chart instance if it exists
        if (vespaDistributionChartInstances[canvasId]) {
            vespaDistributionChartInstances[canvasId].destroy();
        }

        const labels = Array.from({ length: 11 }, (_, i) => i.toString()); // Scores 0-10

        // Prepare national distribution data if available
        let nationalDistributionData = null;
        let nationalPatternData = null; // Scaled pattern for display
        if (nationalDistributions && elementKey) {
            // Map element key to the name used in the JSON (e.g., 'vision' -> 'Vision')
            const elementNameMap = {
                'vision': 'Vision',
                'effort': 'Effort',
                'systems': 'Systems',
                'practice': 'Practice',
                'attitude': 'Attitude',
                'overall': 'Overall'
            };
            
            const elementName = elementNameMap[elementKey];
            if (elementName && nationalDistributions[elementName]) {
                // Convert the distribution object to an array for Chart.js
                nationalDistributionData = labels.map(label => {
                    return nationalDistributions[elementName][label] || 0;
                });
                
                // Option 1: Scale national data to match school data range for pattern comparison
                const schoolMax = Math.max(...schoolScoreDistribution);
                const nationalMax = Math.max(...nationalDistributionData);
                
                // Option 2: Convert to percentages (uncomment to use this approach instead)
                // const schoolTotal = schoolScoreDistribution.reduce((sum, val) => sum + val, 0);
                // const nationalTotal = nationalDistributionData.reduce((sum, val) => sum + val, 0);
                // if (schoolTotal > 0 && nationalTotal > 0) {
                //     schoolScoreDistribution = schoolScoreDistribution.map(val => (val / schoolTotal) * 100);
                //     nationalPatternData = nationalDistributionData.map(val => (val / nationalTotal) * 100);
                //     // Would also need to update y-axis label to "Percentage of Students"
                // }
                
                // Using Option 1: Scale to match
                if (nationalMax > 0 && schoolMax > 0) {
                    // Scale national data to match school's maximum, preserving the pattern
                    const scaleFactor = schoolMax / nationalMax * 0.8; // 0.8 to keep it slightly below school max
                    nationalPatternData = nationalDistributionData.map(value => value * scaleFactor);
                    log(`Scaled national pattern for ${elementName} with factor ${scaleFactor}`);
                } else {
                    nationalPatternData = nationalDistributionData;
                }
            }
        }

        const datasets = [{
            label: 'School Score Distribution',
            data: schoolScoreDistribution,
            backgroundColor: color || 'rgba(75, 192, 192, 0.8)',
            borderColor: color || 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            order: 2 // Draw bars first
        }];

        // Add national distribution pattern as a line if data is available
        if (nationalPatternData) {
            datasets.push({
                label: 'Global Pattern',
                data: nationalPatternData,
                type: 'line',
                borderColor: 'rgba(255, 217, 61, 0.5)', // More subtle golden yellow
                backgroundColor: 'rgba(255, 217, 61, 0.05)',
                borderWidth: 2,
                borderDash: [8, 4], // Longer dashes for pattern indication
                pointRadius: 2, // Smaller points
                pointBackgroundColor: 'rgba(255, 217, 61, 0.5)',
                pointBorderColor: 'rgba(255, 217, 61, 0.7)',
                tension: 0.4, // Smoother curve to emphasize pattern
                order: 1 // Draw line on top
            });
        }

        const chartConfig = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.5,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: '#ffffff',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: nationalPatternData ? true : false, // Show legend only if we have national data
                        labels: {
                            color: '#a8b2d1',
                            usePointStyle: true,
                            padding: 10,
                            font: {
                                size: 11
                            },
                            generateLabels: function(chart) {
                                const defaultLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                // Customize the national pattern label
                                defaultLabels.forEach(label => {
                                                                    if (label.text === 'Global Pattern') {
                                    label.text = 'Global Pattern (scaled for comparison)';
                                    }
                                });
                                return defaultLabels;
                            }
                        }
                    },
                    datalabels: {
                        display: false // Disable data labels on bars and line points
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: color,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const datasetLabel = context.dataset.label;
                                const value = context.raw;
                                if (datasetLabel === 'School Score Distribution') {
                                    return `Your School: ${value} students`;
                                } else if (datasetLabel === 'Global Pattern') {
                                    // For national pattern, show it as a relative indicator
                                    const scoreIndex = parseInt(context.label);
                                    const nationalValue = nationalDistributionData ? nationalDistributionData[scoreIndex] : 0;
                                    return `Global Pattern (${nationalValue.toLocaleString()} students globally)`;
                                }
                                return `${datasetLabel}: ${value}`;
                            }
                        }
                    },
                    annotation: { // Annotation plugin configuration
                        annotations: {}
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            borderColor: 'rgba(255, 255, 255, 0.2)'
                        },
                        title: {
                            display: true,
                            text: 'Number of Students',
                            color: '#a8b2d1'
                        },
                        ticks: { // Ensure y-axis ticks are integers
                            color: '#a8b2d1',
                            stepSize: 1,
                            callback: function(value) { if (Number.isInteger(value)) { return value; } }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            borderColor: 'rgba(255, 255, 255, 0.2)'
                        },
                        title: {
                            display: true,
                            text: 'Score (0-10)',
                            color: '#a8b2d1'
                        },
                        ticks: {
                            color: '#a8b2d1'
                        }
                    }
                }
            }
        };

        // Check for Annotation plugin specifically before trying to use its options
        let annotationPluginAvailable = false;
        if (typeof Annotation !== 'undefined') annotationPluginAvailable = true;
        else if (typeof Chart !== 'undefined' && Chart.Annotation) annotationPluginAvailable = true;
        else if (typeof window !== 'undefined' && window.ChartAnnotation) annotationPluginAvailable = true;
        else if (typeof Chart !== 'undefined' && Chart.registry && Chart.registry.getPlugin && Chart.registry.getPlugin('annotation')) annotationPluginAvailable = true;

        if (nationalAverageScore !== null && typeof nationalAverageScore !== 'undefined' && annotationPluginAvailable) {
            chartConfig.options.plugins.annotation.annotations[`nationalAvgLine-${elementKey}`] = {
                type: 'line',
                xMin: nationalAverageScore,
                xMax: nationalAverageScore,
                borderColor: '#ffd93d',
                borderWidth: 3,
                borderDash: [8, 4], // Dashed line
                label: {
                    enabled: true,
                    content: `${comparisonLabel} Avg: ${nationalAverageScore.toFixed(1)}`,
                    position: 'start',
                    backgroundColor: 'rgba(255, 217, 61, 0.9)',
                    font: { 
                        weight: 'bold',
                        size: 12
                    },
                    color: '#0f0f23',
                    padding: 4
                }
            };
        } else if (nationalAverageScore !== null && typeof nationalAverageScore !== 'undefined') {
            // Fallback: add to title if annotation plugin is not available
            chartConfig.options.plugins.title.text += ` (${comparisonLabel} Avg: ${nationalAverageScore.toFixed(2)})`;
        }

        log(`Creating histogram for ${canvasId} with title: '${chartConfig.options.plugins.title.text}'`); // Log final title

        try {
            vespaDistributionChartInstances[canvasId] = new Chart(ctx, chartConfig);
        } catch (e) {
            errorLog(`Error creating histogram for ${canvasId}:`, e);
        }
    }

    // --- Section 2: Question Level Analysis (QLA) ---
    let allQuestionResponses = []; // Cache for QLA data
    let questionMappings = { id_to_text: {}, psychometric_details: {} }; // Cache for mappings

    async function loadQLAData(staffAdminId, establishmentId = null, trustIdentifier = null, filters = []) {
        log(`Loading QLA data with Staff Admin ID: ${staffAdminId}, Establishment ID: ${establishmentId}, Filters:`, filters);
        try {
            // Fetch question mappings first
            try {
                const mappingResponse = await fetch(`${config.herokuAppUrl}/api/question-mappings`);
                if (!mappingResponse.ok) {
                    const errorData = await mappingResponse.json().catch(() => ({}));
                    throw new Error(errorData.message || `Failed to fetch question mappings: ${mappingResponse.status}`);
                }
                questionMappings = await mappingResponse.json();
                log("Question mappings loaded:", questionMappings);
            } catch (mapError) {
                errorLog("Failed to load question mappings", mapError);
            }

            // Fetch pre-calculated insights
            const filterPayload = {};
            if (establishmentId) filterPayload.establishmentId = establishmentId;
            if (staffAdminId) filterPayload.staffAdminId = staffAdminId;
            if (trustIdentifier && trustIdentifier.trustFieldValue) {
                filterPayload.trustFieldValue = trustIdentifier.trustFieldValue;
            }
            // Append main dashboard filters to the request
            filterPayload.additionalFilters = filters;

            try {
                // Get top/bottom questions
                const res = await fetch(`${config.herokuAppUrl}/api/qla-analysis`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        analysisType: 'topBottom',
                        questionIds: [],
                        filters: filterPayload
                    })
                });
                if (!res.ok) throw new Error(`QLA analysis failed (${res.status})`);
                const analysisData = await res.json();

                log("QLA top/bottom analysis data:", analysisData);

                // Convert to array format and map question IDs to text
                const mapQuestionIdToText = (qid) => {
                    // First check if we have psychometric details
                    if (questionMappings.psychometric_details) {
                        const detail = questionMappings.psychometric_details.find(d => 
                            d.questionId === qid || 
                            d.questionId === qid.toLowerCase() ||
                            d.questionId === `q${qid.replace('Q', '')}` ||
                            d.questionId === `q${qid.replace('q', '')}`
                        );
                        if (detail) return detail.questionText;
                    }
                    
                    // Fallback to id_to_text mapping if available
                    if (questionMappings.id_to_text) {
                        // Check various field IDs that might correspond to this question
                        for (const [fieldId, text] of Object.entries(questionMappings.id_to_text)) {
                            // This is a simplified check - you might need to enhance this
                            if (fieldId.includes(qid)) return text;
                        }
                    }
                    
                    return `Question ${qid}`;
                };

                const top = Object.entries(analysisData.top || {})
                    .map(([id, data]) => ({ 
                        id, 
                        score: typeof data === 'object' ? data.score : data,
                        n: typeof data === 'object' ? data.n : 0,
                        text: mapQuestionIdToText(id)
                    }));
                const bottom = Object.entries(analysisData.bottom || {})
                    .map(([id, data]) => ({ 
                        id, 
                        score: typeof data === 'object' ? data.score : data,
                        n: typeof data === 'object' ? data.n : 0,
                        text: mapQuestionIdToText(id)
                    }));

                log("Mapped top questions:", top);
                log("Mapped bottom questions:", bottom);

                // Render the enhanced cards
                renderEnhancedQuestionCards(top, bottom, []);
                
                // Load pre-calculated insights
                await loadPreCalculatedInsights(filterPayload);
                
            } catch (err) {
                errorLog('Failed QLA analysis', err);
                const qlaSection = document.getElementById('qla-section');
                if (qlaSection) {
                    qlaSection.innerHTML = '<p>Error loading Question Level Analysis data. Please check console.</p>';
                }
            }
        } catch (error) {
            errorLog("Failed to load QLA data", error);
            const qlaSection = document.getElementById('qla-section');
            if(qlaSection) qlaSection.innerHTML = "<p>Error loading Question Level Analysis data. Please check console.</p>";
        }
    }

    // New function to load pre-calculated insights
    async function loadPreCalculatedInsights(filters) {
        const insightsContainer = document.getElementById('qla-insights-grid');
        if (!insightsContainer) return;
        
        // Show loading state
        insightsContainer.innerHTML = `
            <div class="qla-loading">
                <div class="spinner"></div>
                <p>Calculating insights...</p>
            </div>
        `;
        
        // Define meaningful insights based on actual psychometric questions
        const insightQuestions = [
            {
                id: 'growth_mindset',
                title: 'Growth Mindset',
                question: 'What percentage believe intelligence can be developed?',
                type: 'percentAgree',
                questionIds: ['Q5', 'Q26'], // Growth mindset questions
                icon: '🌱'
            },
            {
                id: 'academic_momentum',
                title: 'Academic Momentum',
                question: 'What percentage show strong drive and engagement?',
                type: 'percentAgree',
                questionIds: ['Q14', 'Q16', 'Q17', 'Q9'], // Goals, enjoyment, perfectionism, hard work
                icon: '🚀'
            },
            {
                id: 'study_effectiveness',
                title: 'Study Effectiveness',
                question: 'What percentage use proven study techniques?',
                type: 'percentAgree',
                questionIds: ['Q7', 'Q12', 'Q15'], // Self-testing, spaced revision, summarizing
                icon: '📚'
            },
            {
                id: 'exam_confidence',
                title: 'Exam Confidence',
                question: 'What percentage feel confident about exams?',
                type: 'percentAgree',
                questionIds: ['OUTCOME_Q_CONFIDENT'], // Outcome question about exam confidence
                icon: '🎯'
            },
            {
                id: 'organization_skills',
                title: 'Organization Skills',
                question: 'What percentage are well-organized?',
                type: 'percentAgree',
                questionIds: ['Q2', 'Q22', 'Q11'], // Planning, organized files, deadlines
                icon: '📋'
            },
            {
                id: 'resilience_factor',
                title: 'Resilience',
                question: 'What percentage show academic resilience?',
                type: 'percentAgree',
                questionIds: ['Q13', 'Q8', 'Q27'], // Bounce back, positive view, feedback
                icon: '💪'
            },
            {
                id: 'stress_management',
                title: 'Stress Management',
                question: 'What percentage handle pressure well?',
                type: 'percentAgree',
                questionIds: ['Q20', 'Q28'], // Cope with pressure, control nerves
                icon: '😌'
            },
            {
                id: 'active_learning',
                title: 'Active Learning',
                question: 'What percentage engage in active learning?',
                type: 'percentAgree',
                questionIds: ['Q7', 'Q23', 'Q19'], // Self-testing, teaching others, mixing topics
                icon: '🎓'
            },
            {
                id: 'support_readiness',
                title: 'Support Readiness',
                question: 'What percentage feel supported this year?',
                type: 'percentAgree',
                questionIds: ['OUTCOME_Q_SUPPORT'], // Outcome question about support
                icon: '🤝'
            },
            {
                id: 'time_management',
                title: 'Time Management',
                question: 'What percentage manage time effectively?',
                type: 'percentAgree',
                questionIds: ['Q2', 'Q4', 'Q11'], // Planning, homework, deadlines
                icon: '⏰'
            },
            {
                id: 'academic_confidence',
                title: 'Academic Confidence',
                question: 'What percentage are confident in their ability?',
                type: 'percentAgree',
                questionIds: ['Q10', 'Q8'], // Academic confidence, positive self-view
                icon: '⭐'
            },
            {
                id: 'revision_readiness',
                title: 'Revision Ready',
                question: 'What percentage feel equipped for revision challenges?',
                type: 'percentAgree',
                questionIds: ['OUTCOME_Q_EQUIPPED'], // Outcome question about being equipped
                icon: '📖'
            }
        ];
        
        // Use batch endpoint for better performance
        try {
            const batchRequest = {
                analyses: insightQuestions.map(insight => ({
                    id: insight.id,
                    type: insight.type,
                    questionIds: insight.questionIds
                })),
                filters: filters
            };
            
            const res = await fetch(`${config.herokuAppUrl}/api/qla-batch-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batchRequest)
            });
            
            if (res.ok) {
                const batchResults = await res.json();
                
                // Map results back to insights
                const insights = insightQuestions.map(insight => ({
                    ...insight,
                    data: batchResults[insight.id] || null
                }));
                
                // Render the insights grid
                renderInsightsGrid(insights);
            } else {
                throw new Error('Batch analysis failed');
            }
        } catch (err) {
            console.error('Failed to fetch insights:', err);
            
            // Fallback to individual requests if batch fails
            const insightPromises = insightQuestions.map(async (insight) => {
                try {
                    const res = await fetch(`${config.herokuAppUrl}/api/qla-analysis`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            analysisType: insight.type,
                            questionIds: insight.questionIds,
                            filters: filters
                        })
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        return { ...insight, data };
                    }
                } catch (err) {
                    console.error(`Failed to fetch ${insight.id}:`, err);
                }
                return { ...insight, data: null };
            });
            
            const insights = await Promise.all(insightPromises);
            renderInsightsGrid(insights);
        }
    }
    
    // New function to render insights grid
    function renderInsightsGrid(insights) {
        const container = document.getElementById('qla-insights-grid');
        if (!container) return;
        
        // Store insights globally for report generation
        currentQLAInsights = insights.map(insight => {
            const hasData = insight.data && insight.data.percent !== undefined;
            const percentage = hasData ? insight.data.percent : 0;
            return {
                title: insight.title,
                percentage: percentage,
                question: insight.question || ''
            };
        });
        log('Stored QLA insights globally:', currentQLAInsights);
        
        container.innerHTML = insights.map((insight, index) => {
            const hasData = insight.data && insight.data.percent !== undefined;
            const percentage = hasData ? insight.data.percent : 0;
            const sampleSize = hasData ? insight.data.n : 0;
            
            // Determine color based on percentage
            let colorClass = 'poor';
            if (percentage >= 80) colorClass = 'excellent';
            else if (percentage >= 60) colorClass = 'good';
            else if (percentage >= 40) colorClass = 'average';
            
            return `
                <div class="insight-card ${colorClass}">
                    <button class="insight-info-btn" onclick="window.showInsightInfoModal('${insight.id}')" title="Learn more about ${insight.title}">i</button>
                    <div class="insight-icon">${insight.icon}</div>
                    <div class="insight-content">
                        <h4>${insight.title}</h4>
                        <div class="insight-percentage">${percentage.toFixed(1)}%</div>
                        <p class="insight-question">${insight.question}</p>
                        <div class="insight-sample">n = ${sampleSize}</div>
                    </div>
                    <div class="insight-indicator ${colorClass}"></div>
                </div>
            `;
        }).join('');
        
        // Store insights data for modal access
        window.insightsData = insights;
    }

    function calculateAverageScoresForQuestions(responses) {
        const questionScores = {};
        const questionCounts = {};
        const currentQuestionTextMapping = questionMappings.id_to_text || {};

        if (!Array.isArray(responses) || responses.length === 0) {
            log("calculateAverageScoresForQuestions: Input is not a valid array or is empty", responses);
            return {}; // Return empty object if no valid responses
        }

        responses.forEach(record => {
            for (const fieldKeyInRecord in record) {
                // fieldKeyInRecord is like 'field_794_raw'
                if (fieldKeyInRecord.startsWith('field_') && fieldKeyInRecord.endsWith('_raw')) {
                    const baseFieldId = fieldKeyInRecord.replace('_raw', ''); // e.g., field_794
                    
                    // Check if this field is a known question from our mapping
                    if (currentQuestionTextMapping[baseFieldId] || (questionMappings.psychometric_details && isFieldInPsychometricDetails(baseFieldId, questionMappings.psychometric_details))) {
                        const score = parseInt(record[fieldKeyInRecord], 10);
                        if (!isNaN(score) && score >= 1 && score <= 5) { // Assuming 1-5 scale from README for Object_29
                            questionScores[baseFieldId] = (questionScores[baseFieldId] || 0) + score;
                            questionCounts[baseFieldId] = (questionCounts[baseFieldId] || 0) + 1;
                        }
                    }
                }
            }
        });

        const averageScores = {};
        for (const qId in questionScores) {
            if (questionCounts[qId] > 0) {
                averageScores[qId] = parseFloat((questionScores[qId] / questionCounts[qId]).toFixed(2));
            }
        }
        return averageScores; 
    }

    // Helper to check if a fieldId is part of the psychometric question details
    function isFieldInPsychometricDetails(fieldId, psychometricDetailsArray) {
        if (!psychometricDetailsArray || !Array.isArray(psychometricDetailsArray)) return false;
        // psychometric_question_details.json is an array of objects,
        // each object has a 'currentCycleFieldId' property.
        return psychometricDetailsArray.some(qDetail => qDetail.currentCycleFieldId === fieldId);
    }

    // Helper function to get question text mapping
    async function getQuestionTextMapping() {
        // Return the cached mapping or fetch it if needed
        if (questionMappings.id_to_text && Object.keys(questionMappings.id_to_text).length > 0) {
            return questionMappings.id_to_text;
        }
        
        // If not cached, return an empty object (the mapping should have been loaded in loadQLAData)
        return {};
    }

    async function displayTopBottomQuestions(responses) {
        if (!responses || responses.length === 0) return;
        
        const averageScores = calculateAverageScoresForQuestions(responses);
        const questionTextMapping = await getQuestionTextMapping();

        const sortedQuestions = Object.entries(averageScores)
            .map(([fieldId, avgScore]) => ({
                id: fieldId,
                text: questionTextMapping[fieldId] || `Unknown Question (${fieldId})`,
                score: avgScore
            }))
            .sort((a, b) => b.score - a.score);

        const top5 = sortedQuestions.slice(0, 5);
        const bottom5 = sortedQuestions.slice(-5).reverse(); // Reverse to show lowest score first if desired

        // Create enhanced card-based display
        renderEnhancedQuestionCards(top5, bottom5, responses);
    }
    
    function renderEnhancedQuestionCards(topQuestions, bottomQuestions, allResponses) {
        const container = document.getElementById('qla-top-bottom-questions');
        if (!container) return;
        
        container.innerHTML = `
            <div class="qla-top-bottom-container">
                <div class="qla-questions-section top-questions">
                    <h3>
                        <div class="title-content">
                            <span class="icon">🏆</span> Top Statement Responses
                        </div>
                        <button class="qla-info-btn" onclick="window.showQLAInfoModal()">i</button>
                    </h3>
                    <div class="question-cards" id="top-question-cards">
                        <div class="qla-loading">
                            <div class="spinner"></div>
                            <p>Loading question analysis...</p>
                        </div>
                    </div>
                </div>
                <div class="qla-questions-section bottom-questions">
                    <h3>
                        <div class="title-content">
                            <span class="icon">⚠️</span> Responses Needing Attention
                        </div>
                    </h3>
                    <div class="question-cards" id="bottom-question-cards">
                        <div class="qla-loading">
                            <div class="spinner"></div>
                            <p>Loading question analysis...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Render cards with slight delay for animation
        setTimeout(() => {
            renderQuestionCards('top-question-cards', topQuestions, allResponses, 'top');
            renderQuestionCards('bottom-question-cards', bottomQuestions, allResponses, 'bottom');
        }, 100);
    }
    
    function renderQuestionCards(containerId, questions, allResponses, type) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        // Sort questions based on type
        const sortedQuestions = [...questions];
        if (type === 'top') {
            sortedQuestions.sort((a, b) => b.score - a.score); // Highest to lowest
        } else if (type === 'bottom') {
            sortedQuestions.sort((a, b) => a.score - b.score); // Lowest to highest
        }
        
        sortedQuestions.forEach((question, index) => {
            const card = createQuestionCard(question, index + 1, allResponses, type);
            container.appendChild(card);
        });
    }
    
    function createQuestionCard(question, rank, allResponses, type) {
        const card = document.createElement('div');
        card.className = 'question-card';
        
        // Determine color class based on score
        let colorClass = '';
        if (question.score >= 4) colorClass = 'excellent';
        else if (question.score >= 3) colorClass = 'good';
        else if (question.score >= 2) colorClass = 'average';
        else colorClass = 'poor';
        
        card.classList.add(colorClass);
        
        // Calculate statistics for this question
        const stats = calculateQuestionStatistics(question.id, allResponses);
        
        // Generate estimated statistics based on the average score
        // This provides reasonable approximations when we don't have raw data
        const estimatedStats = estimateStatisticsFromAverage(question.score, question.n || 0);
        
        // Merge estimated stats with any real stats we have
        const finalStats = {
            count: question.n || stats.count || estimatedStats.count,
            stdDev: stats.stdDev || estimatedStats.stdDev,
            mode: stats.mode || estimatedStats.mode,
            distribution: stats.distribution.some(v => v > 0) ? stats.distribution : estimatedStats.distribution
        };
        
        card.innerHTML = `
            <div class="question-rank">${rank}</div>
            <div class="question-text">${question.text}</div>
            <div class="score-section">
                <div class="score-indicator">${question.score.toFixed(2)}</div>
                <div class="mini-chart-container">
                    <canvas id="mini-chart-${question.id}"></canvas>
                </div>
            </div>
            <div class="stats-details">
                <div class="stat-item">
                    <span class="stat-label">Responses</span>
                    <span class="stat-value">${finalStats.count}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Std Dev</span>
                    <span class="stat-value">${finalStats.stdDev.toFixed(2)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Mode</span>
                    <span class="stat-value">${finalStats.mode}</span>
                </div>
            </div>
        `;
        
        // Add click handler for detailed analysis
        card.addEventListener('click', () => {
            showQuestionDetailModal(question, finalStats, allResponses);
        });
        
        // Create mini chart after card is added to DOM
        setTimeout(() => {
            createMiniChart(`mini-chart-${question.id}`, finalStats.distribution, colorClass);
        }, 100);
        
        return card;
    }
    
    function estimateStatisticsFromAverage(avgScore, responseCount = 0) {
        // Generate a reasonable distribution based on the average score
        // This uses a normal-like distribution centered around the average
        const distribution = [0, 0, 0, 0, 0];
        const roundedAvg = Math.round(avgScore);
        
        if (responseCount > 0) {
            // Create a bell curve-like distribution
            const variance = 0.8; // Typical variance for 5-point scale
            
            for (let i = 1; i <= 5; i++) {
                const distance = Math.abs(i - avgScore);
                const probability = Math.exp(-(distance * distance) / (2 * variance));
                distribution[i - 1] = Math.round(probability * responseCount * 0.4);
            }
            
            // Adjust to ensure total matches response count
            const currentTotal = distribution.reduce((sum, val) => sum + val, 0);
            if (currentTotal > 0) {
                const scaleFactor = responseCount / currentTotal;
                for (let i = 0; i < 5; i++) {
                    distribution[i] = Math.round(distribution[i] * scaleFactor);
                }
            }
        }
        
        // Find the mode (peak of distribution)
        let maxCount = 0;
        let mode = roundedAvg;
        distribution.forEach((count, index) => {
            if (count > maxCount) {
                maxCount = count;
                mode = index + 1;
            }
        });
        
        // Estimate standard deviation based on score
        let stdDev = 0.87; // Default
        if (avgScore >= 4.5 || avgScore <= 1.5) {
            stdDev = 0.65; // Less variation at extremes
        } else if (avgScore >= 4 || avgScore <= 2) {
            stdDev = 0.75;
        } else {
            stdDev = 0.95; // More variation in middle range
        }
        
        return {
            count: responseCount,
            stdDev: stdDev,
            mode: mode,
            distribution: distribution
        };
    }
    
    function calculateQuestionStatistics(questionId, allResponses) {
        // If we have actual response data, use it
        if (allResponses && allResponses.length > 0) {
            const scores = [];
            const distribution = [0, 0, 0, 0, 0]; // For scores 1-5
            
            allResponses.forEach(response => {
                const score = parseInt(response[questionId + '_raw']);
                if (!isNaN(score) && score >= 1 && score <= 5) {
                    scores.push(score);
                    distribution[score - 1]++;
                }
            });
            
            if (scores.length > 0) {
                // Calculate standard deviation
                const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
                const stdDev = Math.sqrt(variance);
                
                // Find mode (most frequent score)
                let maxCount = 0;
                let mode = 0;
                distribution.forEach((count, index) => {
                    if (count > maxCount) {
                        maxCount = count;
                        mode = index + 1;
                    }
                });
                
                return {
                    count: scores.length,
                    stdDev: stdDev || 0,
                    mode: mode,
                    distribution: distribution,
                    scores: scores
                };
            }
        }
        
        // Fallback: Generate approximate statistics based on the average score
        // This is used when we don't have raw response data
        return {
            count: 0, // Will be updated from the backend data if available
            stdDev: 0.87, // Typical standard deviation for survey data
            mode: 0, // Will be calculated from distribution
            distribution: [0, 0, 0, 0, 0], // Will be estimated
            scores: []
        };
    }
    
    function createMiniChart(canvasId, distribution, colorClass) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Color based on performance
        const colors = {
            excellent: '#10b981',
            good: '#3b82f6',
            average: '#f59e0b',
            poor: '#ef4444'
        };
        
        const color = colors[colorClass] || '#64748b';
        
        // Create a simple bar chart
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['1', '2', '3', '4', '5'],
                datasets: [{
                    data: distribution,
                    backgroundColor: color + 'CC', // Higher opacity (80%)
                    borderColor: color,
                    borderWidth: 1.5,
                    borderRadius: 3,
                    barPercentage: 0.8,
                    categoryPercentage: 0.9
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    },
                    datalabels: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        display: false,
                        beginAtZero: true,
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        display: true, // Show x-axis labels for better clarity
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.5)',
                            font: {
                                size: 9
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        top: 5,
                        bottom: 0,
                        left: 2,
                        right: 2
                    }
                }
            }
        });
    }
    
    function showQuestionDetailModal(question, stats, allResponses) {
        // TODO: Implement detailed question analysis modal
        log(`Showing detail modal for question: ${question.text}`);
        // This will be implemented in Phase 2 with advanced statistics
    }




    // --- Section 3: Student Comment Insights ---
    async function loadStudentCommentInsights(staffAdminId, establishmentId = null, trustIdentifier = null, filters = []) {
        log(`Loading student comment insights with Staff Admin ID: ${staffAdminId}, Establishment ID: ${establishmentId}, Filters:`, filters);
        try {
            // Prepare filters for comment analysis
            const requestFilters = {};
            if (establishmentId) {
                requestFilters.establishmentId = establishmentId;
            } else if (staffAdminId) {
                requestFilters.staffAdminId = staffAdminId;
            } else if (trustIdentifier && trustIdentifier.trustFieldValue) {
                requestFilters.trustFieldValue = trustIdentifier.trustFieldValue;
            }
            // Append main dashboard filters to the request
            requestFilters.additionalFilters = filters;
            
            // Define comment fields to analyze
            const commentFields = [
                'field_2302', // RRC1
                'field_2303', // RRC2
                'field_2304', // RRC3
                'field_2499', // GOAL1
                'field_2493', // GOAL2
                'field_2494'  // GOAL3
            ];
            
            // Fetch word cloud data
            try {
                const wordCloudResponse = await fetch(`${config.herokuAppUrl}/api/comment-wordcloud`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commentFields: commentFields,
                        filters: requestFilters
                    })
                });
                
                if (wordCloudResponse.ok) {
                    const wordCloudData = await wordCloudResponse.json();
                    renderWordCloud(wordCloudData);
                }
            } catch (error) {
                errorLog("Failed to fetch word cloud data", error);
            }
            
            // Fetch theme analysis
            const themesContainer = document.getElementById('common-themes-container');
            if (themesContainer) {
                // Show loading state for themes
                themesContainer.innerHTML = `
                    <div class="themes-loading">
                        <h3>Theme Analysis</h3>
                        <div class="loading-content">
                            <div class="spinner"></div>
                            <p>Analyzing comments with AI...</p>
                            <p class="loading-note">This may take up to 30 seconds</p>
                        </div>
                    </div>
                `;
            }
            
            try {
                log(`Fetching theme analysis for ${commentFields.length} comment fields...`);
                
                // Create fetch options with optional timeout
                const fetchOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commentFields: commentFields,
                        filters: requestFilters
                    })
                };
                
                // Add timeout if supported
                if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                    fetchOptions.signal = AbortSignal.timeout(25000); // 25 second timeout
                }
                
                // Try the fast word-cloud based theme analysis first
                let endpoint = '/api/comment-themes-fast';
                
                // Check if we should use the original endpoint (for backwards compatibility)
                const useFastThemes = true; // Set to false to use original method
                
                if (!useFastThemes) {
                    endpoint = '/api/comment-themes';
                }
                
                const themesResponse = await fetch(`${config.herokuAppUrl}${endpoint}`, fetchOptions);
                
                if (themesResponse.ok) {
                    const themesData = await themesResponse.json();
                    log("Theme analysis response:", themesData);
                    renderThemes(themesData);
                } else {
                    // Handle non-ok responses
                    const errorText = await themesResponse.text();
                    errorLog(`Theme analysis failed with status ${themesResponse.status}:`, errorText);
                    
                    // Try to parse as JSON to get error message
                    let errorData = { message: errorText };
                    try {
                        errorData = JSON.parse(errorText);
                    } catch (e) {
                        // Not JSON, use text as-is
                    }
                    
                    // Still render to show the error to user
                    renderThemes({
                        themes: [],
                        totalThemes: 0,
                        totalComments: 0,
                        message: errorData.message || `Theme analysis failed: ${themesResponse.status}`
                    });
                }
            } catch (error) {
                errorLog("Failed to fetch themes data", error);
                // Show error to user
                renderThemes({
                    themes: [],
                    totalThemes: 0,
                    totalComments: 0,
                    message: `Error connecting to theme analysis: ${error.message}`
                });
            }

        } catch (error) {
            errorLog("Failed to load student comment insights", error);
        }
    }

    function renderWordCloud(data) {
        const container = document.getElementById('word-cloud-container');
        if (!container) return;
        
        // Handle empty data or error messages
        if (!data || !data.wordCloudData || data.wordCloudData.length === 0) {
            const message = data?.message || 'No comment data available for word cloud.';
            container.innerHTML = `<p class="no-data-message">${message}</p>`;
            return;
        }
        
        // Create canvas for word cloud
        container.innerHTML = '<canvas id="word-cloud-canvas" width="800" height="400"></canvas>';
        
        // Check if WordCloud2 is available
        if (typeof WordCloud !== 'undefined') {
            const canvas = document.getElementById('word-cloud-canvas');
            
            // Ensure canvas has proper dimensions
            const containerWidth = container.offsetWidth || 800;
            const containerHeight = 400;
            canvas.width = containerWidth;
            canvas.height = containerHeight;
            
            const words = data.wordCloudData.map(item => [item.text, item.size]);
            
            try {
                // Configure word cloud
                WordCloud(canvas, {
                    list: words,
                    gridSize: Math.round(16 * containerWidth / 1024),
                    weightFactor: function(size) {
                        return Math.pow(size, 1.5) * containerWidth / 1024;
                    },
                    fontFamily: 'Inter, sans-serif',
                    color: function(word, weight) {
                        // Use theme colors
                        const colors = ['#ff8f00', '#86b4f0', '#72cb44', '#7f31a4', '#f032e6', '#ffd93d'];
                        return colors[Math.floor(Math.random() * colors.length)];
                    },
                    rotateRatio: 0.5,
                    rotationSteps: 2,
                    backgroundColor: 'transparent',
                    minSize: 12,
                    drawOutOfBound: false,
                    shrinkToFit: true
                });
            } catch (error) {
                errorLog("WordCloud2 rendering error", error);
                // Fallback to word list on error
                renderWordListFallback(container, data);
            }
        } else {
            // Fallback to simple word list
            renderWordListFallback(container, data);
        }
        
        // Add summary stats
        if (data.totalComments) {
            const statsHtml = `
                <div class="word-cloud-stats">
                    <span>Total Comments: ${data.totalComments}</span>
                    <span>Unique Words: ${data.uniqueWords}</span>
                    ${data.topWord ? `<span>Most Common: "${data.topWord[0]}" (${data.topWord[1]} times)</span>` : ''}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', statsHtml);
        }
    }
    
    function renderWordListFallback(container, data) {
        container.innerHTML = `
            <div class="word-list">
                <h4>Most Common Words</h4>
                <div class="words">
                    ${data.wordCloudData.slice(0, 20).map(item => 
                        `<span class="word-item" style="font-size: ${Math.min(2, 0.8 + item.size/50)}rem">${item.text}</span>`
                    ).join('')}
                </div>
            </div>
        `;
    }

    function renderThemes(data) {
        const container = document.getElementById('common-themes-container');
        if (!container) return;
        
        // Handle empty data or messages
        if (!data || !data.themes || data.themes.length === 0) {
            const message = data?.message || 'No themes available for analysis.';
            // Check if it's specifically the OpenAI configuration issue
            if (message.includes('OpenAI API configuration')) {
                container.innerHTML = `
                    <div class="theme-analysis-pending">
                        <h3>Theme Analysis</h3>
                        <div class="config-message">
                            <p><strong>Configuration Required:</strong> Theme analysis uses AI to automatically identify patterns in student comments.</p>
                            <p>Found <strong>${data?.totalComments || 0} comments</strong> ready to analyze.</p>
                            <p class="setup-note">To enable this feature, please configure the OpenAI API key in your backend settings.</p>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = `<p class="no-data-message">${message}</p>`;
            }
            return;
        }
        
        container.innerHTML = `
            <h3>Common Themes</h3>
            <div class="themes-grid">
                ${data.themes.map(theme => `
                    <div class="theme-card ${theme.sentiment}">
                        <h4>${theme.theme}</h4>
                        <div class="theme-count">${theme.count} mentions</div>
                        <div class="theme-examples">
                            ${theme.examples.map(ex => {
                                // Handle both quote format and keyword format
                                if (ex.startsWith('"') || ex.length > 50) {
                                    // It's a quote
                                    return `<p>${ex.startsWith('"') ? ex : `"${ex}"`}</p>`;
                                } else {
                                    // It's a keyword
                                    return `<span class="theme-keyword">${ex}</span>`;
                                }
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // --- Print Report Functions ---
    async function generatePrintReport() {
        try {
            // Show loading state
            GlobalLoader.init();
            GlobalLoader.updateProgress(10, 'Gathering report data...');
            
            // Get current dashboard state
            const cycleSelect = document.getElementById('cycle-select');
            const currentCycle = cycleSelect ? parseInt(cycleSelect.value) : 1;
            
            // Get establishment info
            const establishmentName = selectedEstablishmentName || 
                document.getElementById('current-establishment-name')?.textContent || 
                'Unknown Establishment';
            
            // Collect VESPA scores from the dashboard
            const vespaScores = collectVespaScores();
            
            // Collect QLA insights
            const qlaInsights = collectQLAInsights();
            
            GlobalLoader.updateProgress(30, 'Generating PDF report...');
            
            // Prepare request data
            const reportData = {
                establishmentId: currentEstablishmentId || selectedEstablishmentId,
                establishmentName: establishmentName,
                staffAdminId: currentStaffAdminId,
                cycle: currentCycle,
                vespaScores: vespaScores,
                qlaInsights: qlaInsights,
                filters: getActiveFilters()
            };
            
            log('Report data being sent to backend:', reportData);
            
            // Call backend to generate PDF
            const response = await fetch(`${config.herokuAppUrl}/api/generate-report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(reportData)
            });
            
            GlobalLoader.updateProgress(70, 'Preparing download...');
            
            if (!response.ok) {
                throw new Error(`Failed to generate report: ${response.status}`);
            }
            
            // Get the PDF blob
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `VESPA_Report_${establishmentName.replace(/\s+/g, '_')}_Cycle${currentCycle}_${new Date().toISOString().split('T')[0]}.pdf`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            GlobalLoader.updateProgress(100, 'Report downloaded!');
            setTimeout(() => GlobalLoader.hide(), 1000);
            
        } catch (error) {
            console.error('Failed to generate report:', error);
            GlobalLoader.hide();
            alert('Failed to generate report. Please try again or contact support.');
        }
    }

    // Global variable to store current VESPA data
    let currentVespaScores = {};
    
    // Global variable to store current QLA insights
    let currentQLAInsights = [];
    
    // Helper function to check if report data is ready
    function isReportDataReady() {
        // Check if we have VESPA scores and QLA insights
        const hasVespaScores = Object.keys(currentVespaScores).length > 0;
        const hasQLAInsights = currentQLAInsights.length > 0;
        return hasVespaScores || hasQLAInsights;
    }

    // Update print button state based on data availability
    function updatePrintButtonState() {
        const printBtn = document.getElementById('print-report-btn');
        if (printBtn) {
            const dataReady = isReportDataReady();
            printBtn.disabled = !dataReady;
            if (dataReady) {
                printBtn.classList.add('ready');
            } else {
                printBtn.classList.remove('ready');
            }
        }
    }
    
    // Helper function to collect VESPA scores from the dashboard
    function collectVespaScores() {
        const scores = {};
        
        // First try to use the stored global data if available
        if (Object.keys(currentVespaScores).length > 0) {
            log('Using stored VESPA scores:', currentVespaScores);
            return currentVespaScores;
        }
        
        // Get school scores from the score cards
        const scoreCards = document.querySelectorAll('.vespa-score-card');
        log(`Found ${scoreCards.length} VESPA score cards`);
        
        scoreCards.forEach(card => {
            const title = card.querySelector('h3')?.textContent?.toLowerCase();
            const scoreValue = card.querySelector('.score-value')?.textContent;
            const nationalComparison = card.querySelector('.national-comparison')?.textContent;
            
            log(`Processing card - Title: ${title}, Score: ${scoreValue}, National: ${nationalComparison}`);
            
            if (title && scoreValue && scoreValue !== 'N/A') {
                // Parse the score value, handling potential formatting
                const parsedScore = parseFloat(scoreValue.replace(/[^0-9.-]/g, ''));
                if (!isNaN(parsedScore)) {
                    scores[title] = parsedScore;
                    
                    // Extract national average from comparison text
                    const nationalMatch = nationalComparison?.match(/Global:\s*([\d.]+)/);
                    if (nationalMatch) {
                        const nationalScore = parseFloat(nationalMatch[1]);
                        if (!isNaN(nationalScore)) {
                            scores[`${title}National`] = nationalScore;
                        }
                    }
                }
            }
        });
        
        // Store globally for future use
        if (Object.keys(scores).length > 0) {
            currentVespaScores = scores;
        }
        
        log('Collected VESPA scores:', scores);
        updatePrintButtonState();
        return scores;
    }
    
    // Helper function to collect QLA insights
    function collectQLAInsights() {
        // First try to use the stored global data if available
        if (currentQLAInsights.length > 0) {
            log('Using stored QLA insights:', currentQLAInsights);
            return currentQLAInsights;
        }
        
        const insights = [];
        
        // Get insights from the insights grid
        const insightCards = document.querySelectorAll('.insight-card');
        log(`Found ${insightCards.length} QLA insight cards`);
        
        insightCards.forEach(card => {
            const title = card.querySelector('h4')?.textContent;
            const percentageText = card.querySelector('.insight-percentage')?.textContent;
            const question = card.querySelector('.insight-question')?.textContent;
            
            log(`Processing insight - Title: ${title}, Percentage: ${percentageText}, Question: ${question}`);
            
            if (title && percentageText) {
                // Parse percentage, removing % sign and any other characters
                const parsedPercentage = parseFloat(percentageText.replace(/[^0-9.-]/g, ''));
                if (!isNaN(parsedPercentage)) {
                    insights.push({
                        title: title,
                        percentage: parsedPercentage,
                        question: question || ''
                    });
                }
            }
        });
        
        // Sort by percentage descending
        insights.sort((a, b) => b.percentage - a.percentage);
        
        // Store globally for future use
        if (insights.length > 0) {
            currentQLAInsights = insights;
        }
        
        log('Collected QLA insights:', insights);
        updatePrintButtonState();
        return insights;
    }

    // Add print button to the dashboard header
    function addPrintReportButton() {
        const headerElem = document.querySelector('#dashboard-container header');
        if (headerElem && !document.getElementById('print-report-btn')) {
            const printBtn = document.createElement('button');
            printBtn.id = 'print-report-btn';
            printBtn.className = 'print-report-btn';
            printBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8" rx="2" ry="2"></rect>
                </svg>
                <span>Generate Report</span>`;
            
            // Initially disabled until data ready
            printBtn.disabled = true;

            printBtn.addEventListener('click', (e) => {
                // Safety-check — shouldn't be clickable when disabled, but defensive code helps
                if (!isReportDataReady()) {
                    alert('Report not ready yet – wait for data to finish loading.');
                    return;
                }
                generatePrintReport();
            });

            headerElem.appendChild(printBtn);
        }
        
        // Also try to add the button after a delay if the dashboard is still loading
        setTimeout(() => {
            const headerElem = document.querySelector('#dashboard-container header');
            if (headerElem && !document.getElementById('print-report-btn')) {
                addPrintReportButton();
            }
            updatePrintButtonState();
        }, 2000);
    }

    // --- Initialization ---
    async function initializeFullDashboard() {
        const targetElement = document.querySelector(elementSelector);
        if (!targetElement) {
            errorLog(`Target element "${elementSelector}" not found for dashboard.`);
            return;
        }

        // Get logged in user email from config or Knack directly
        let loggedInUserEmail = config.loggedInUserEmail;
    
        // If not in config, try to get from Knack
        if (!loggedInUserEmail && typeof Knack !== 'undefined' && Knack.getUserAttributes) {
            try {
                const userAttributes = Knack.getUserAttributes();
                loggedInUserEmail = userAttributes.email || userAttributes.values?.email;
                console.log("Got user email from Knack:", loggedInUserEmail);
            } catch (e) {
                console.error("Failed to get user email from Knack:", e);
            }
        }
    
        // If still no email, try alternative Knack method
        if (!loggedInUserEmail && typeof Knack !== 'undefined' && Knack.session && Knack.session.user) {
            try {
                loggedInUserEmail = Knack.session.user.email;
                console.log("Got user email from Knack session:", loggedInUserEmail);
            } catch (e) {
                console.error("Failed to get user email from Knack session:", e);
            }
        }

        if (!loggedInUserEmail) {
            errorLog("No loggedInUserEmail found in config. Cannot check user status.");
            renderDashboardUI(targetElement); // Render basic UI
            document.getElementById('overview-section').innerHTML = "<p>Cannot load dashboard: User email not found.</p>";
            document.getElementById('qla-section').innerHTML = "<p>Cannot load dashboard: User email not found.</p>";
            document.getElementById('student-insights-section').innerHTML = "<p>Cannot load dashboard: User email not found.</p>";
            return;
        }

        // --- New Logic: Prioritize Staff Admin check ---
        let staffAdminRecordId = null;
        let isStaffAdmin = false;

        try {
            staffAdminRecordId = await getStaffAdminRecordIdByEmail(loggedInUserEmail);
            if (staffAdminRecordId) {
                isStaffAdmin = true;
                log("User is a Staff Admin! Staff Admin Record ID:", staffAdminRecordId);
            } else {
                log("User is NOT a Staff Admin.");
            }
        } catch (e) {
            errorLog("Error checking Staff Admin status:", e);
        }

        // Only check Super User status if not already a Staff Admin
        if (!isStaffAdmin) {
            const checkSuperUser = await checkSuperUserStatus(loggedInUserEmail);
            if (checkSuperUser) {
                superUserRecordId = checkSuperUser;
                isSuperUser = true;
                log("User is a Super User!");
            } else {
                log("User is NOT a Super User.");
            }
        } else {
             log("User is a Staff Admin, skipping Super User check for primary role determination.");
        }

        renderDashboardUI(targetElement, isSuperUser); // Render main structure with Super User controls if applicable

        // Attempt to register Chart.js plugins globally if they are loaded
        if (typeof Chart !== 'undefined') {
            if (typeof ChartDataLabels !== 'undefined') {
                Chart.register(ChartDataLabels);
                log("ChartDataLabels plugin registered globally.");
            } else {
                log("ChartDataLabels plugin not found globally during init.");
            }
            
            // Attempt to register Annotation plugin (checking common global names)
            let annotationPlugin = null;
            if (typeof Annotation !== 'undefined') { // Direct global name
                annotationPlugin = Annotation;
            } else if (typeof Chart !== 'undefined' && Chart.Annotation) { // Often attached to Chart object
                annotationPlugin = Chart.Annotation;
            } else if (typeof window !== 'undefined' && window.ChartAnnotation) { // Another common global pattern
                annotationPlugin = window.ChartAnnotation;
            }

            if (annotationPlugin) {
                try {
                    Chart.register(annotationPlugin);
                    log("Annotation plugin registered globally.");
                } catch (e) {
                    errorLog("Error registering Annotation plugin globally: ", e)
                }
            } else {
                log("Annotation plugin not found globally (checked Annotation, Chart.Annotation, window.ChartAnnotation) during init. Global benchmark lines on histograms may not appear.");
            }
            
            // Register Gauge chart controller if available
            if (typeof Chart.controllers.gauge !== 'undefined' || (window.ChartGauge && window.ChartGauge.GaugeController)) {
                try {
                    // The gauge plugin might auto-register, but let's ensure it's registered
                    if (window.ChartGauge && window.ChartGauge.GaugeController) {
                        Chart.register(window.ChartGauge.GaugeController, window.ChartGauge.ArcElement);
                        log("Gauge chart plugin registered from ChartGauge global.");
                    } else {
                        log("Gauge chart controller appears to be auto-registered.");
                    }
                } catch (e) {
                    errorLog("Error registering Gauge plugin: ", e);
                }
            } else {
                log("Gauge chart plugin not found during init. Will use doughnut chart fallback for ERI gauge.");
            }
        } else {
            log("Chart.js core (Chart) not found globally during init. All charts will fail.");
        }

        // Load data based on role
        if (isStaffAdmin) {
            log("Loading dashboard for Staff Admin:", staffAdminRecordId);
            GlobalLoader.updateProgress(20, 'Authenticating user...');
            
            try {
                // Initial data load (defaulting to cycle 1 or what's selected)
                const cycleSelectElement = document.getElementById('cycle-select');
                const initialCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
                
                // Fetch all initial data using batch endpoint
                GlobalLoader.updateProgress(30, 'Loading dashboard data...');
                const batchData = await fetchDashboardInitialData(staffAdminRecordId, null, initialCycle);
                
                // Populate filter dropdowns from cached data
                GlobalLoader.updateProgress(50, 'Setting up filters...');
                populateFilterDropdownsFromCache(batchData.filterOptions);
                
                // Load overview section first, then other sections
                GlobalLoader.updateProgress(70, 'Rendering dashboard...');
                await loadOverviewData(staffAdminRecordId, initialCycle);
                
                // Add print report button after dashboard loads
                addPrintReportButton();
                
                // Load other sections in background after main dashboard is ready
                setTimeout(async () => {
                    try {
                        await Promise.all([
                            loadQLAData(staffAdminRecordId),
                            loadStudentCommentInsights(staffAdminRecordId)
                        ]);
                    } catch (error) {
                        errorLog("Error loading secondary sections", error);
                    }
                }, 100); // Small delay to ensure main UI is responsive
                
                GlobalLoader.updateProgress(90, 'Finalizing...');
                
                // Hide global loader
                GlobalLoader.updateProgress(100, 'Dashboard ready!');
                setTimeout(() => GlobalLoader.hide(), 500);
                
                // Mark initialization as complete
                dashboardInitialized = true;
                initializationInProgress = false;
                
                // Add event listener for cycle selector
                if (cycleSelectElement) {
                    cycleSelectElement.addEventListener('change', async (event) => {
                        const selectedCycle = parseInt(event.target.value, 10);
                        log(`Cycle changed to: ${selectedCycle}`);
                        
                        // Show loading overlay for cycle change
                        GlobalLoader.init();
                        GlobalLoader.updateProgress(10, `Loading data for Cycle ${selectedCycle}...`);
                        
                        try {
                            // Check if we have cached data for this cycle
                            const cacheKey = `cycle_${selectedCycle}_data`;
                            const cachedCycleData = DataCache.getFromLocalStorage(cacheKey);
                            
                            if (cachedCycleData) {
                                GlobalLoader.updateProgress(50, 'Loading cached data...');
                                // Use cached data
                                DataCache.set('vespaResults', cachedCycleData.vespaResults);
                                DataCache.set('nationalBenchmark', cachedCycleData.nationalBenchmark);
                                
                                // Update UI with cached data
                                updateResponseStatsFromCache(cachedCycleData.vespaResults, selectedCycle);
                                const schoolAverages = calculateSchoolVespaAverages(cachedCycleData.vespaResults, selectedCycle);
                                const nationalAverages = getNationalVespaAveragesFromRecord(cachedCycleData.nationalBenchmark, selectedCycle);
                                renderCombinedVespaDisplay(selectedCycle, {});
                                
                                GlobalLoader.updateProgress(100, 'Dashboard updated!');
                                setTimeout(() => GlobalLoader.hide(), 300);
                            } else {
                                // Fetch fresh data
                                GlobalLoader.updateProgress(30, 'Fetching data from server...');
                                const activeFilters = getActiveFilters();
                                
                                // Fetch data for new cycle
                                const batchData = await fetchDashboardInitialData(staffAdminRecordId, null, selectedCycle);
                                
                                // Cache the cycle data
                                DataCache.saveToLocalStorage(cacheKey, {
                                    vespaResults: batchData.vespaResults,
                                    nationalBenchmark: batchData.nationalBenchmark,
                                    timestamp: Date.now()
                                });
                                
                                GlobalLoader.updateProgress(70, 'Rendering dashboard...');
                                await loadOverviewData(staffAdminRecordId, selectedCycle, activeFilters);
                                
                                GlobalLoader.updateProgress(100, 'Dashboard updated!');
                                setTimeout(() => GlobalLoader.hide(), 500);
                            }
                        } catch (error) {
                            errorLog("Error changing cycle", error);
                            GlobalLoader.hide();
                            // Fallback to original method
                            const activeFilters = getActiveFilters();
                            await loadOverviewData(staffAdminRecordId, selectedCycle, activeFilters);
                        }
                    });
                }
                
            } catch (error) {
                errorLog("Failed to initialize dashboard", error);
                GlobalLoader.hide();
                initializationInProgress = false;
                document.getElementById('overview-section').innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
                document.getElementById('qla-section').innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
                document.getElementById('student-insights-section').innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
            }
            
            // Add event listeners for filter buttons with debouncing
            const applyFiltersBtn = document.getElementById('apply-filters-btn');
            if (applyFiltersBtn) {
                let filterTimeout;
                applyFiltersBtn.addEventListener('click', () => {
                    // Clear any pending filter applications
                    if (filterTimeout) clearTimeout(filterTimeout);
                    
                    // Debounce filter application
                    filterTimeout = setTimeout(async () => {
                        GlobalLoader.init();
                        GlobalLoader.updateProgress(20, 'Applying filters...');
                        
                        const selectedCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
                        const activeFilters = getActiveFilters();
                        log("Applying filters:", activeFilters);
                        
                        try {
                            GlobalLoader.updateProgress(40, 'Processing filtered data...');
                            await loadOverviewData(staffAdminRecordId, selectedCycle, activeFilters);
                            GlobalLoader.updateProgress(100, 'Filters applied!');
                            setTimeout(() => GlobalLoader.hide(), 300);
                        } catch (error) {
                            errorLog("Error applying filters", error);
                            GlobalLoader.hide();
                        }
                    }, 300); // 300ms debounce
                });
            }
            
            const clearFiltersBtn = document.getElementById('clear-filters-btn');
            if (clearFiltersBtn) {
                clearFiltersBtn.addEventListener('click', () => {
                    // Clear all filter inputs
                    document.getElementById('student-search').value = '';
                    document.getElementById('group-filter').value = '';
                    document.getElementById('course-filter').value = '';
                    document.getElementById('year-group-filter').value = '';
                    document.getElementById('faculty-filter').value = '';
                    
                    // Clear the active filters display
                    updateActiveFiltersDisplay([]);
                    
                    // Reload data without filters
                    const selectedCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
                    log("Clearing all filters");
                    loadOverviewData(staffAdminRecordId, selectedCycle, []);
                });
            }

        } else if (isSuperUser) {
            log("Super User mode active. Waiting for establishment selection.");
            GlobalLoader.updateProgress(100, 'Please select an establishment to continue...');
            GlobalLoader.hide();
            document.getElementById('overview-section').style.display = 'none'; // Hide if super user and waiting for selection
            document.getElementById('qla-section').style.display = 'none';
            document.getElementById('student-insights-section').style.display = 'none';
            return; // Exit here for Super Users if they are not Staff Admins
        } else {
            errorLog("Neither Staff Admin nor Super User role found. Cannot load dashboard.");
            GlobalLoader.hide();
            document.getElementById('overview-section').innerHTML = "<p>Cannot load dashboard: Your account does not have the required Staff Admin or Super User role.</p>";
            document.getElementById('qla-section').innerHTML = "<p>Cannot load dashboard: Your account does not have the required Staff Admin or Super User role.</p>";
            document.getElementById('student-insights-section').innerHTML = "<p>Cannot load dashboard: Your account does not have the required Staff Admin or Super User role.</p>";
        }
    }
    
    initializeFullDashboard(); // Call the main async initialization function
}

// Defensive check: If jQuery is used by Knack/other scripts, ensure this script runs after.
// However, the loader script (WorkingBridge.js) should handle calling initializeDashboardApp
// at the appropriate time.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // initializeDashboardApp(); // Not strictly necessary if WorkingBridge calls it
    });
} else {
    // initializeDashboardApp(); // Or call if DOM is already ready, though WorkingBridge is preferred.
}

    // Make sure initializeDashboardApp is globally accessible if WorkingBridge.js calls it.
// If it's not already, you might need:
// window.initializeDashboardApp = initializeDashboardApp;
// However, since it's a top-level function in the script, it should be.

// Debug function to test modal buttons (remove after testing)
window.testAnalysisModal = function() {
    console.log('Testing analysis modal...');
    const modal = document.getElementById('analysis-type-modal');
    const continueBtn = document.getElementById('analysis-continue-btn');
    const cancelBtn = document.getElementById('analysis-cancel-btn');
    
    console.log('Modal found:', !!modal);
    console.log('Continue button found:', !!continueBtn);
    console.log('Cancel button found:', !!cancelBtn);
    
    if (continueBtn) {
        console.log('Continue button disabled:', continueBtn.disabled);
        console.log('Continue button style.display:', continueBtn.style.display);
        console.log('Continue button computed style:', window.getComputedStyle(continueBtn).display);
    }
    
    if (cancelBtn) {
        console.log('Cancel button style.display:', cancelBtn.style.display);
        console.log('Cancel button computed style:', window.getComputedStyle(cancelBtn).display);
    }
    
    // Test radio buttons
    const radios = document.querySelectorAll('input[name="analysis-type"]');
    console.log('Radio buttons found:', radios.length);
    
    return { modal, continueBtn, cancelBtn, radios };
};

// Test function to simulate selecting the first radio button
window.testSelectFirstOption = function() {
    const firstRadio = document.querySelector('input[name="analysis-type"]');
    if (firstRadio) {
        console.log('Selecting first radio button:', firstRadio.value);
        firstRadio.checked = true;
        
        // Trigger change event
        const changeEvent = new Event('change', { bubbles: true });
        firstRadio.dispatchEvent(changeEvent);
        
        console.log('Radio button selected and change event triggered');
        
        // Check continue button state
        const continueBtn = document.getElementById('analysis-continue-btn');
        if (continueBtn) {
            console.log('Continue button disabled after selection:', continueBtn.disabled);
        }
    } else {
        console.log('No radio buttons found');
    }
};

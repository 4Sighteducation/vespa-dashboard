// dashboard2x.js
// @ts-nocheck

// Global loader management
const GlobalLoader = {
    overlay: null,
    progressBar: null,
    progressText: null,
    
    init() {
        // Create loader HTML immediately
        const loaderHTML = `
            <div class="global-loading-overlay active" id="global-loading-overlay">
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
        
        // Insert at the beginning of body
        document.body.insertAdjacentHTML('afterbegin', loaderHTML);
        
        this.overlay = document.getElementById('global-loading-overlay');
        this.progressBar = document.getElementById('loading-progress-bar');
        this.progressText = this.overlay.querySelector('.loading-subtext');
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

// Data cache management
const DataCache = {
    vespaResults: null,
    nationalBenchmark: null,
    filterOptions: null,
    psychometricResponses: null,
    lastFetchTime: null,
    cacheTimeout: 5 * 60 * 1000, // 5 minutes
    
    set(key, value) {
        this[key] = value;
        this.lastFetchTime = Date.now();
    },
    
    get(key) {
        // Check if cache is still valid
        if (this.lastFetchTime && (Date.now() - this.lastFetchTime) < this.cacheTimeout) {
            return this[key];
        }
        return null;
    },
    
    clear() {
        this.vespaResults = null;
        this.nationalBenchmark = null;
        this.filterOptions = null;
        this.psychometricResponses = null;
        this.lastFetchTime = null;
    }
};

// Ensure this matches the initializerFunctionName in WorkingBridge.js
function initializeDashboardApp() {
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
            
            return data;
        } catch (error) {
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
            log("Fetching establishments from dedicated endpoint");
            
            // Use the new establishments endpoint
            const url = `${config.herokuAppUrl}/api/establishments`;
            log("Fetching from establishments endpoint:", url);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch establishments: ${response.status}`);
            }
            
            const data = await response.json();
            log(`Fetched ${data.total} establishments from ${data.source_object}`);
            
            if (data.partial) {
                log("Note: Partial establishment list due to size limits");
            }
            
            return data.establishments || [];
            
        } catch (error) {
            errorLog("Failed to fetch establishments", error);
            
            // Fallback to the old method with better error handling
            try {
                log("Falling back to extracting establishments from VESPA results");
                const establishmentMap = new Map();
                
                // Just fetch first page to avoid timeout
                const vespaRecords = await fetchDataFromKnack(
                    objectKeys.vespaResults, 
                    [], 
                    { rows_per_page: 100 }
                );
                
                if (vespaRecords && vespaRecords.length > 0) {
                    vespaRecords.forEach(record => {
                        if (record.field_133_raw && record.field_133) {
                            if (Array.isArray(record.field_133_raw)) {
                                record.field_133_raw.forEach((id, index) => {
                                    if (id && !establishmentMap.has(id)) {
                                        const displayName = Array.isArray(record.field_133) ? 
                                            record.field_133[index] : record.field_133;
                                        establishmentMap.set(id, displayName || id);
                                    }
                                });
                            } else if (typeof record.field_133_raw === 'string' && record.field_133_raw.trim()) {
                                const id = record.field_133_raw.trim();
                                const name = record.field_133 || id;
                                if (!establishmentMap.has(id)) {
                                    establishmentMap.set(id, name);
                                }
                            }
                        }
                    });
                }
                
                const establishments = Array.from(establishmentMap.entries())
                    .map(([id, name]) => ({ id, name }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                log(`Found ${establishments.length} establishments (limited sample)`);
                return establishments;
                
            } catch (fallbackError) {
                errorLog("Fallback method also failed", fallbackError);
                return [];
            }
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
        `;
        document.head.appendChild(style);
        
        // Build the HTML with conditional Super User controls
        let superUserControlsHTML = '';
        if (showSuperUserControls) {
            superUserControlsHTML = `
                <div class="super-user-controls">
                    <div class="super-user-header">
                        <span class="super-user-badge">⚡ Super User Mode</span>
                        <span class="super-user-title">Establishment Emulator</span>
                    </div>
                    <div class="super-user-form">
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
                    <div id="qla-controls">
                        <select id="qla-question-dropdown"></select>
                        <input type="text" id="qla-chat-input" placeholder="Ask about the question data...">
                        <button id="qla-chat-submit">Ask AI</button>
                    </div>
                    <div id="qla-ai-response"></div>
                    <div id="qla-top-bottom-questions">
                        <h3>Top 5 Questions</h3>
                        <ul id="qla-top-5"></ul>
                        <h3>Bottom 5 Questions</h3>
                        <ul id="qla-bottom-5"></ul>
                    </div>
                    <div id="qla-stats">
                        <!-- Other interesting statistical info -->
                    </div>
                </section>
                <section id="student-insights-section" style="${showSuperUserControls ? 'display: none;' : ''}">
                    <h2>Student Comment Insights</h2>
                    <div id="word-cloud-container"></div>
                    <div id="common-themes-container"></div>
                </section>
            </div>
        `;
        
        // Add event listeners for UI elements
        document.getElementById('qla-chat-submit')?.addEventListener('click', handleQLAChatSubmit);
        
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
            
            if (loadEstablishmentBtn) {
                loadEstablishmentBtn.addEventListener('click', handleEstablishmentLoad);
            }
            
            if (establishmentSearch) {
                establishmentSearch.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    filterEstablishmentDropdown(searchTerm);
                });
            }
            
            // Load establishments
            loadEstablishmentsDropdown();
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
        
        // Update the current viewing display
        const currentViewingDiv = document.getElementById('current-establishment-viewing');
        const currentNameSpan = document.getElementById('current-establishment-name');
        if (currentViewingDiv) currentViewingDiv.style.display = 'flex';
        if (currentNameSpan) currentNameSpan.textContent = selectedEstablishmentName;
        
        // Show all sections
        document.getElementById('overview-section').style.display = 'block';
        document.getElementById('qla-section').style.display = 'block';
        document.getElementById('student-insights-section').style.display = 'block';
        
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
    
    // New function to load dashboard with establishment filter
    async function loadDashboardWithEstablishment(establishmentId, establishmentName) {
        log(`Loading dashboard data for VESPA Customer: ${establishmentName} (${establishmentId})`);
        
        // Show global loader
        GlobalLoader.init();
        GlobalLoader.updateProgress(10, `Loading data for ${establishmentName}...`);
        
        try {
            // Load initial data
            const cycleSelectElement = document.getElementById('cycle-select');
            const initialCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
            
            // Fetch all initial data using batch endpoint
            GlobalLoader.updateProgress(30, 'Fetching dashboard data...');
            const batchData = await fetchDashboardInitialData(null, establishmentId, initialCycle);
            
            // Populate filter dropdowns from cached data
            GlobalLoader.updateProgress(50, 'Setting up filters...');
            populateFilterDropdownsFromCache(batchData.filterOptions);
            
            // Load all sections with cached data
            GlobalLoader.updateProgress(70, 'Rendering visualizations...');
            await Promise.all([
                loadOverviewData(null, initialCycle, [], establishmentId),
                loadQLAData(null, establishmentId),
                loadStudentCommentInsights(null, establishmentId)
            ]);
            
            GlobalLoader.updateProgress(90, 'Finalizing...');
            
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
                    await loadOverviewData(null, selectedCycle, activeFilters, establishmentId);
                });
            }
            
            GlobalLoader.updateProgress(100, 'Dashboard ready!');
            setTimeout(() => GlobalLoader.hide(), 500);
            
        } catch (error) {
            errorLog("Failed to load establishment dashboard", error);
            GlobalLoader.hide();
            document.getElementById('overview-section').innerHTML = `<p>Error loading dashboard for ${establishmentName}: ${error.message}</p>`;
            document.getElementById('qla-section').innerHTML = `<p>Error loading dashboard for ${establishmentName}: ${error.message}</p>`;
            document.getElementById('student-insights-section').innerHTML = `<p>Error loading dashboard for ${establishmentName}: ${error.message}</p>`;
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
                loadOverviewData(null, selectedCycle, activeFilters, establishmentId);
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
                log("Clearing all filters");
                loadOverviewData(null, selectedCycle, [], establishmentId);
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

    async function loadOverviewData(staffAdminId, cycle = 1, additionalFilters = [], establishmentId = null) {
        log(`Loading overview data with Staff Admin ID: ${staffAdminId}, Establishment ID: ${establishmentId} for Cycle: ${cycle}`);
        const loadingIndicator = document.getElementById('loading-indicator');
        const combinedContainer = document.getElementById('vespa-combined-container');

        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (combinedContainer) combinedContainer.style.display = 'none'; // Hide while loading

        try {
            // Use batch endpoint to fetch all data at once
            GlobalLoader.updateProgress(40, 'Loading dashboard data...');
            const batchData = await fetchDashboardInitialData(staffAdminId, establishmentId, cycle);
            
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
            
            // ERI data is already calculated in batch response
            const schoolERI = batchData.schoolERI;
            const nationalERI = batchData.nationalERI || 3.5; // Default if not available
            
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

    function renderAveragesChart(schoolData, nationalData, cycle) {
        // Note: This function now only creates the score cards
        // The distribution charts will be created after this function is called
        const container = document.getElementById('vespa-combined-container');
        if (!container) {
            errorLog("VESPA combined container not found");
            return;
        }

        log(`Creating score cards for Cycle ${cycle}. School:`, schoolData, "Global:", nationalData);

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
            const nationalScore = nationalData[element.key];

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
                    Global: ${nationalScoreToDisplay} <span class="arrow ${arrowClass}">${arrow}</span> ${percentageDiffText}
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
                nationalDistributions
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

    function renderDistributionCharts(schoolResults, nationalAveragesData, themeColorsConfig, cycle, nationalDistributions) {
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
            
            const nationalAverageForElement = nationalAveragesData ? nationalAveragesData[element.key] : null;
            const canvasId = `${element.key}-distribution-chart`;
            let chartTitle = `${element.name} Score Distribution - Cycle ${cycle}`;

            log(`For ${element.name} Distribution - National Avg: ${nationalAverageForElement}`);

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
                key: element.key
            };
        });
        
        // Now combine everything in the right order
        renderCombinedVespaDisplay(cycle, nationalDistributions);
    }

    function createSingleHistogram(canvasId, title, schoolScoreDistribution, nationalAverageScore, color, cycle, elementKey, nationalDistributions) {
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
                    content: `Global Avg: ${nationalAverageScore.toFixed(1)}`,
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
            chartConfig.options.plugins.title.text += ` (Global Avg: ${nationalAverageScore.toFixed(2)})`;
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

    async function loadQLAData(staffAdminId, establishmentId = null) {
        log(`Loading QLA data with Staff Admin ID: ${staffAdminId}, Establishment ID: ${establishmentId}`);
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
                // Proceeding without mappings might make QLA less user-friendly
                // but some parts might still work if IDs are used.
            }


            // Fetch all records from Object_29 (Questionnaire Qs)
            // Filter by Staff Admin ID or Establishment (VESPA Customer)
            let qlaFilters = [];
            
            if (establishmentId) {
                // Super User mode - filter by VESPA Customer (field_1821) which links to establishment
                // Note: establishmentId is now a VESPA Customer ID from object_2
                qlaFilters.push({
                    field: 'field_1821', 
                    operator: 'is',
                    value: establishmentId
                });
                allQuestionResponses = await fetchDataFromKnack(objectKeys.questionnaireResponses, qlaFilters);
                log("Fetched QLA Responses (filtered by VESPA Customer):", allQuestionResponses ? allQuestionResponses.length : 0);
            } else if (staffAdminId) {
                // Normal mode - filter by Staff Admin
                qlaFilters.push({
                    field: 'field_2069', 
                    operator: 'is', // For array connections, 'is' often works like 'contains this ID' in Knack.
                    value: staffAdminId
                });
                allQuestionResponses = await fetchDataFromKnack(objectKeys.questionnaireResponses, qlaFilters);
                log("Fetched QLA Responses (filtered by Staff Admin ID):", allQuestionResponses ? allQuestionResponses.length : 0);
            } else { 
                log("No Staff Admin ID or Establishment ID provided to loadQLAData. Cannot filter QLA data. Attempting to fetch all.");
                allQuestionResponses = await fetchDataFromKnack(objectKeys.questionnaireResponses, []); // Fetch all if no filter
            }
            // log("QLA data loaded:", allQuestionResponses.length, "responses"); // Already logged above if filtered

            populateQLAQuestionDropdown();
            displayTopBottomQuestions(allQuestionResponses);
            displayQLAStats(allQuestionResponses);

        } catch (error) {
            errorLog("Failed to load QLA data", error);
            const qlaSection = document.getElementById('qla-section');
            if(qlaSection) qlaSection.innerHTML = "<p>Error loading Question Level Analysis data. Please check console.</p>";
        }
    }


    async function populateQLAQuestionDropdown() {
        const dropdown = document.getElementById('qla-question-dropdown');
        if (!dropdown) return;

        try {
            const response = await fetch(`${config.herokuAppUrl}/api/interrogation-questions`); 
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch interrogation questions');
            }
            const questions = await response.json(); 

            dropdown.innerHTML = '<option value="">Select a question...</option>'; // Clear previous/add default
            questions.forEach(qObj => { // Assuming backend sends array of {id, question}
                const option = document.createElement('option');
                option.value = qObj.question; // Use the question text itself as value, or qObj.id if you prefer
                option.textContent = qObj.question;
                dropdown.appendChild(option);
            });
            log("Populated QLA question dropdown.");
        } catch (error) {
            errorLog("Failed to populate QLA question dropdown", error);
            dropdown.innerHTML = "<option>Error loading questions</option>";
        }
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
                            <span class="icon">🏆</span> Top Performing Questions
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
                            <span class="icon">⚠️</span> Questions Needing Attention
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
        
        questions.forEach((question, index) => {
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
                    <span class="stat-value">${stats.count}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Std Dev</span>
                    <span class="stat-value">${stats.stdDev.toFixed(2)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Mode</span>
                    <span class="stat-value">${stats.mode}</span>
                </div>
            </div>
        `;
        
        // Add click handler for detailed analysis
        card.addEventListener('click', () => {
            showQuestionDetailModal(question, stats, allResponses);
        });
        
        // Create mini chart after card is added to DOM
        setTimeout(() => {
            createMiniChart(`mini-chart-${question.id}`, stats.distribution, colorClass);
        }, 100);
        
        return card;
    }
    
    function calculateQuestionStatistics(questionId, allResponses) {
        const scores = [];
        const distribution = [0, 0, 0, 0, 0]; // For scores 1-5
        
        allResponses.forEach(response => {
            const score = parseInt(response[questionId + '_raw']);
            if (!isNaN(score) && score >= 1 && score <= 5) {
                scores.push(score);
                distribution[score - 1]++;
            }
        });
        
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

    function displayQLAStats(responses) {
        // Calculate and display other stats:
        // - Overall response distribution for key questions
        // - Percentage agreement/disagreement for certain statements
        const statsContainer = document.getElementById('qla-stats');
        if (statsContainer) {
            statsContainer.innerHTML = "<p>Other QLA stats will go here.</p>";
        }
    }

    async function handleQLAChatSubmit() {
        const inputElement = document.getElementById('qla-chat-input');
        const dropdownElement = document.getElementById('qla-question-dropdown');
        const responseContainer = document.getElementById('qla-ai-response');

        if (!inputElement || !dropdownElement || !responseContainer) return;

        const userQuery = inputElement.value.trim();
        const selectedQuestion = dropdownElement.value;
        let queryForAI = userQuery;

        if (!queryForAI && selectedQuestion) {
            queryForAI = selectedQuestion; // Use dropdown question if input is empty
        }

        if (!queryForAI) {
            responseContainer.textContent = "Please type a question or select one from the dropdown.";
            return;
        }

        responseContainer.textContent = "Thinking...";
        log("Sending QLA query to AI:", queryForAI);

        try {
            // This is where you'd make a call to your Heroku backend
            // The backend would then use the OpenAI API with the relevant question data context.
            const aiResponse = await fetch(`${config.herokuAppUrl}/api/qla-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send the query AND relevant context (e.g., data for the specific question or all QLA data)
                // Your Heroku app will need to be smart about how it uses this data with the OpenAI prompt.
                body: JSON.stringify({ query: queryForAI, questionData: allQuestionResponses /* or more filtered data */ })
            });

            if (!aiResponse.ok) {
                const errorData = await aiResponse.json();
                throw new Error(errorData.message || `AI request failed with status ${aiResponse.status}`);
            }

            const result = await aiResponse.json();
            responseContainer.textContent = result.answer; // Assuming your Heroku app returns { answer: "..." }
            log("AI Response for QLA:", result.answer);

        } catch (error) {
            errorLog("Error with QLA AI chat:", error);
            responseContainer.textContent = `Error: ${error.message}`;
        }
    }


    // --- Section 3: Student Comment Insights ---
    async function loadStudentCommentInsights(staffAdminId, establishmentId = null) {
        log(`Loading student comment insights with Staff Admin ID: ${staffAdminId}, Establishment ID: ${establishmentId}`);
        try {
            let vespaResults = []; // Initialize as empty array
            const filters = [];
            
            if (establishmentId) {
                // Super User mode - filter by establishment
                filters.push({
                    field: 'field_133',
                    operator: 'is',
                    value: establishmentId
                });
                vespaResults = await fetchDataFromKnack(objectKeys.vespaResults, filters);
                log("Fetched VESPA Results for comments (filtered by Establishment):", vespaResults ? vespaResults.length : 0);
            } else if (staffAdminId) {
                // Normal mode - filter by staff admin
                filters.push({
                    field: 'field_439', 
                    operator: 'is',
                    value: staffAdminId
                });
                vespaResults = await fetchDataFromKnack(objectKeys.vespaResults, filters);
                log("Fetched VESPA Results for comments (filtered by Staff Admin ID):", vespaResults ? vespaResults.length : 0);
            } else {
                 log("No Staff Admin ID or Establishment ID provided to loadStudentCommentInsights. Cannot filter comments.");
            }
            
            if (!Array.isArray(vespaResults)) {
                errorLog("loadStudentCommentInsights: vespaResults is not an array after fetch.", vespaResults);
                vespaResults = []; // Ensure it's an array to prevent further errors
            }

            const allComments = [];
            if (vespaResults.length > 0) { // Only proceed if we have results
                vespaResults.forEach(record => {
                    if (record.field_2302_raw) allComments.push(record.field_2302_raw); // RRC1
                    if (record.field_2303_raw) allComments.push(record.field_2303_raw); // RRC2
                    if (record.field_2304_raw) allComments.push(record.field_2304_raw); // RRC3
                    if (record.field_2499_raw) allComments.push(record.field_2499_raw); // GOAL1
                    if (record.field_2493_raw) allComments.push(record.field_2493_raw); // GOAL2
                    if (record.field_2494_raw) allComments.push(record.field_2494_raw); // GOAL3
                });
            }

            log("Total comments extracted:", allComments.length);

            // Render Word Cloud
            renderWordCloud(allComments);

            // Identify and Display Common Themes (this is more complex, might need NLP on Heroku)
            identifyCommonThemes(allComments);

        } catch (error) {
            errorLog("Failed to load student comment insights", error);
        }
    }

    function renderWordCloud(comments) {
        const container = document.getElementById('word-cloud-container');
        if (!container) return;
        log("Rendering word cloud.");
        // Use a library like WordCloud.js (https://wordcloud2.js.org/) or similar.
        // You'll need to process the text: concatenate, remove stop words, count frequencies.
        // Example (conceptual):
        // const textBlob = comments.join(" ");
        // const wordFrequencies = calculateWordFrequencies(textBlob);
        // WordCloud(container, { list: wordFrequencies });
        container.innerHTML = "<p>Word cloud will go here.</p>";

    }

    function identifyCommonThemes(comments) {
        const container = document.getElementById('common-themes-container');
        if (!container) return;
        log("Identifying common themes.");
        // This is a more advanced NLP task.
        // Simplistic: Count occurrences of keywords.
        // Advanced: Use your Heroku backend + OpenAI to summarize themes.
        // Example:
        // Send comments to Heroku -> Heroku uses OpenAI to extract themes -> display themes.
        container.innerHTML = "<p>Common themes will be listed here.</p>";
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
                
                // Load all sections with cached data
                GlobalLoader.updateProgress(70, 'Rendering dashboard...');
                await Promise.all([
                    loadOverviewData(staffAdminRecordId, initialCycle),
                    loadQLAData(staffAdminRecordId),
                    loadStudentCommentInsights(staffAdminRecordId)
                ]);
                
                GlobalLoader.updateProgress(90, 'Finalizing...');
                
                // Hide global loader
                GlobalLoader.updateProgress(100, 'Dashboard ready!');
                setTimeout(() => GlobalLoader.hide(), 500);
                
                // Add event listener for cycle selector
                if (cycleSelectElement) {
                    cycleSelectElement.addEventListener('change', async (event) => {
                        const selectedCycle = parseInt(event.target.value, 10);
                        log(`Cycle changed to: ${selectedCycle}`);
                        
                        // Clear cache to force refresh for new cycle
                        DataCache.clear();
                        
                        const activeFilters = getActiveFilters();
                        await loadOverviewData(staffAdminRecordId, selectedCycle, activeFilters);
                    });
                }
                
            } catch (error) {
                errorLog("Failed to initialize dashboard", error);
                GlobalLoader.hide();
                document.getElementById('overview-section').innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
                document.getElementById('qla-section').innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
                document.getElementById('student-insights-section').innerHTML = `<p>Error loading dashboard: ${error.message}</p>`;
            }
            
            // Add event listeners for filter buttons
            const applyFiltersBtn = document.getElementById('apply-filters-btn');
            if (applyFiltersBtn) {
                applyFiltersBtn.addEventListener('click', () => {
                    const selectedCycle = cycleSelectElement ? parseInt(cycleSelectElement.value, 10) : 1;
                    const activeFilters = getActiveFilters();
                    log("Applying filters:", activeFilters);
                    loadOverviewData(staffAdminRecordId, selectedCycle, activeFilters);
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
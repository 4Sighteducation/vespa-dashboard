// dashboard.js - Main entry point for modular dashboard
import { Config, ObjectKeys } from './modules/config.js';
import { GlobalLoader } from './modules/loader.js';
import { Utils } from './modules/utils.js';
import { API } from './modules/api.js';
import { Cache } from './modules/cache.js';
import { Filters } from './modules/filters.js';
import { Overview } from './modules/overview.js';
import { QLA } from './modules/qla.js';
import { Insights } from './modules/insights.js';

// Dashboard App Main Controller
const DashboardApp = {
    // State
    isSuperUser: false,
    superUserRecordId: null,
    selectedEstablishmentId: null,
    selectedEstablishmentName: null,
    currentStaffAdminId: null,
    currentEstablishmentId: null,

    // Initialize the dashboard
    async init() {
        // Initialize loader immediately
        GlobalLoader.init();
        GlobalLoader.updateProgress(10, 'Checking configuration...');
        
        // Get configuration
        const config = window.DASHBOARD_CONFIG;
        if (!config) {
            console.error("DASHBOARD_CONFIG not found. Dashboard cannot initialize.");
            GlobalLoader.hide();
            return;
        }

        // Initialize config module
        Config.init(config);
        console.log("Initializing Dashboard App with config:", config);
        
        // Get logged in user email
        const loggedInUserEmail = Utils.getLoggedInUserEmail();
        if (!loggedInUserEmail) {
            Utils.errorLog("No loggedInUserEmail found. Cannot check user status.");
            this.renderUI(document.querySelector(config.elementSelector));
            this.showError("Cannot load dashboard: User email not found.");
            GlobalLoader.hide();
            return;
        }

        // Check user roles
        await this.checkUserRoles(loggedInUserEmail);
        
        // Render UI
        const targetElement = document.querySelector(config.elementSelector);
        if (!targetElement) {
            Utils.errorLog(`Target element "${config.elementSelector}" not found for dashboard.`);
            GlobalLoader.hide();
            return;
        }
        
        this.renderUI(targetElement);
        
        // Initialize based on role
        if (this.currentStaffAdminId) {
            await this.initializeStaffAdminDashboard();
        } else if (this.isSuperUser) {
            await this.initializeSuperUserDashboard();
        } else {
            this.showError("Your account does not have the required Staff Admin or Super User role.");
            GlobalLoader.hide();
        }
    },

    async checkUserRoles(userEmail) {
        // Check Staff Admin first
        try {
            const staffAdminId = await this.getStaffAdminRecordIdByEmail(userEmail);
            if (staffAdminId) {
                this.currentStaffAdminId = staffAdminId;
                Utils.log("User is a Staff Admin! Record ID:", staffAdminId);
                return;
            }
        } catch (e) {
            Utils.errorLog("Error checking Staff Admin status:", e);
        }

        // Check Super User if not Staff Admin
        try {
            const superUserId = await this.checkSuperUserStatus(userEmail);
            if (superUserId) {
                this.superUserRecordId = superUserId;
                this.isSuperUser = true;
                Utils.log("User is a Super User!");
            }
        } catch (e) {
            Utils.errorLog("Error checking Super User status:", e);
        }
    },

    async getStaffAdminRecordIdByEmail(userEmail) {
        if (!userEmail || !ObjectKeys.staffAdminRoles) {
            return null;
        }

        const filters = [{
            field: 'field_86',
            operator: 'is',
            value: userEmail
        }];

        try {
            const staffAdminRecords = await API.fetchDataFromKnack(ObjectKeys.staffAdminRoles, filters);
            if (staffAdminRecords && staffAdminRecords.length > 0) {
                return staffAdminRecords[0].id;
            }
            return null;
        } catch (error) {
            Utils.errorLog(`Error fetching Staff Admin record for email ${userEmail}:`, error);
            return null;
        }
    },

    async checkSuperUserStatus(userEmail) {
        if (!userEmail || !ObjectKeys.superUserRoles) {
            return null;
        }

        const filters = [{
            field: 'field_86',
            operator: 'is',
            value: userEmail
        }];

        try {
            const superUserRecords = await API.fetchDataFromKnack(ObjectKeys.superUserRoles, filters);
            if (superUserRecords && superUserRecords.length > 0) {
                return superUserRecords[0].id;
            }
            return null;
        } catch (error) {
            Utils.errorLog(`Error checking Super User status for email ${userEmail}:`, error);
            return null;
        }
    },

    renderUI(container) {
        Utils.log("Rendering Dashboard UI");
        
        // Import styles
        this.loadStyles();
        
        // Build HTML
        const superUserControlsHTML = this.isSuperUser ? this.getSuperUserControlsHTML() : '';
        
        container.innerHTML = `
            <div id="dashboard-container">
                ${superUserControlsHTML}
                <header>
                    <h1>VESPA Performance Dashboard</h1>
                </header>
                <section id="overview-section" style="${this.isSuperUser ? 'display: none;' : ''}">
                    ${this.getOverviewSectionHTML()}
                </section>
                <section id="qla-section" style="${this.isSuperUser ? 'display: none;' : ''}">
                    ${this.getQLASectionHTML()}
                </section>
                <section id="student-insights-section" style="${this.isSuperUser ? 'display: none;' : ''}">
                    ${this.getInsightsSectionHTML()}
                </section>
            </div>
        `;
        
        // Setup global functions for modals
        this.setupGlobalFunctions();
        
        // Setup Super User controls if needed
        if (this.isSuperUser) {
            this.setupSuperUserControls();
        }
    },

    loadStyles() {
        // Main dashboard styles are already loaded via CDN
        // Load module-specific styles
        const styleModules = ['qla.css', 'insights.css'];
        styleModules.forEach(file => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `src/styles/${file}`;
            document.head.appendChild(link);
        });
    },

    getSuperUserControlsHTML() {
        return `
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
    },

    getOverviewSectionHTML() {
        return `
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
                                <span class="eri-national-value">National: <strong id="eri-national-display">-</strong></span>
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
                <div id="averages-summary-container" class="vespa-scores-grid">
                    <!-- Scorecards will be dynamically inserted here -->
                </div>
                <div id="distribution-charts-container">
                    <div class="chart-wrapper">
                        <canvas id="vision-distribution-chart"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="effort-distribution-chart"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="systems-distribution-chart"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="practice-distribution-chart"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="attitude-distribution-chart"></canvas>
                    </div>
                    <div class="chart-wrapper">
                        <canvas id="overall-distribution-chart"></canvas>
                    </div>
                </div>
            </div>
        `;
    },

    getQLASectionHTML() {
        return `
            <h2>Question Level Analysis</h2>
            <div id="qla-controls">
                <select id="qla-question-dropdown"></select>
                <input type="text" id="qla-chat-input" placeholder="Ask about the question data...">
                <button id="qla-chat-submit">Ask AI</button>
            </div>
            <div id="qla-ai-response"></div>
            <div id="qla-top-bottom-questions">
                <!-- Top/Bottom questions will be rendered here -->
            </div>
            <div id="qla-stats">
                <!-- Statistical insights will be rendered here -->
            </div>
        `;
    },

    getInsightsSectionHTML() {
        return `
            <h2>Student Comment Insights</h2>
            <div id="word-cloud-container"></div>
            <div id="common-themes-container"></div>
        `;
    },

    setupGlobalFunctions() {
        // ERI Info Modal
        window.showERIInfoModal = () => this.showERIInfoModal();
        window.hideERIInfoModal = () => this.hideERIInfoModal();
        
        // Stats Panel
        window.hideStatsPanel = () => this.hideStatsPanel();
        window.showStatsInfoModal = () => this.showStatsInfoModal();
        window.hideStatsInfoModal = () => this.hideStatsInfoModal();
    },

    async initializeStaffAdminDashboard() {
        Utils.log("Loading dashboard for Staff Admin:", this.currentStaffAdminId);
        GlobalLoader.updateProgress(20, 'Authenticating user...');
        
        try {
            const cycleSelect = document.getElementById('cycle-select');
            const initialCycle = cycleSelect ? parseInt(cycleSelect.value, 10) : 1;
            
            // Fetch all initial data using batch endpoint
            GlobalLoader.updateProgress(30, 'Loading dashboard data...');
            const batchData = await API.fetchDashboardInitialData(this.currentStaffAdminId, null, initialCycle);
            
            // Populate filter dropdowns from cached data
            GlobalLoader.updateProgress(50, 'Setting up filters...');
            Filters.populateFilterDropdownsFromCache(batchData.filterOptions);
            
            // Initialize all modules
            GlobalLoader.updateProgress(70, 'Rendering dashboard...');
            await Promise.all([
                Overview.init(this.currentStaffAdminId, null),
                QLA.init(this.currentStaffAdminId, null),
                Insights.init(this.currentStaffAdminId, null)
            ]);
            
            GlobalLoader.updateProgress(90, 'Finalizing...');
            GlobalLoader.updateProgress(100, 'Dashboard ready!');
            setTimeout(() => GlobalLoader.hide(), 500);
            
        } catch (error) {
            Utils.errorLog("Failed to initialize dashboard", error);
            GlobalLoader.hide();
            this.showError(`Error loading dashboard: ${error.message}`);
        }
    },

    async initializeSuperUserDashboard() {
        Utils.log("Super User mode active. Waiting for establishment selection.");
        GlobalLoader.updateProgress(100, 'Please select an establishment to continue...');
        GlobalLoader.hide();
        
        // Load establishments
        await this.loadEstablishmentsDropdown();
    },

    setupSuperUserControls() {
        const loadBtn = document.getElementById('load-establishment-btn');
        const searchInput = document.getElementById('establishment-search');
        
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.handleEstablishmentLoad());
        }
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterEstablishmentDropdown(e.target.value.toLowerCase());
            });
        }
    },

    async loadEstablishmentsDropdown() {
        const establishmentSelect = document.getElementById('establishment-select');
        if (!establishmentSelect) return;
        
        establishmentSelect.innerHTML = '<option value="">Loading VESPA Customers...</option>';
        establishmentSelect.disabled = true;
        
        try {
            const config = Config.getAll();
            const response = await fetch(`${config.herokuAppUrl}/api/establishments`);
            if (!response.ok) {
                throw new Error('Failed to fetch establishments');
            }
            
            const data = await response.json();
            const establishments = data.establishments || [];
            
            if (establishments.length === 0) {
                establishmentSelect.innerHTML = '<option value="">No active VESPA Customers found</option>';
                return;
            }
            
            establishmentSelect.innerHTML = '<option value="">Select a VESPA Customer...</option>';
            establishments.forEach(est => {
                const option = document.createElement('option');
                option.value = est.id;
                option.textContent = est.name;
                if (est.status) {
                    option.setAttribute('data-status', est.status);
                }
                establishmentSelect.appendChild(option);
            });
            
            establishmentSelect.disabled = false;
            Utils.log(`Loaded ${establishments.length} VESPA Customers in dropdown`);
            
        } catch (error) {
            Utils.errorLog("Failed to load establishments", error);
            establishmentSelect.innerHTML = '<option value="">Error loading VESPA Customers - Please refresh</option>';
            establishmentSelect.disabled = false;
        }
    },

    filterEstablishmentDropdown(searchTerm) {
        const establishmentSelect = document.getElementById('establishment-select');
        if (!establishmentSelect) return;
        
        const options = establishmentSelect.querySelectorAll('option');
        options.forEach(option => {
            if (option.value === '') return;
            
            const text = option.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        });
    },

    async handleEstablishmentLoad() {
        const establishmentSelect = document.getElementById('establishment-select');
        const selectedOption = establishmentSelect.selectedOptions[0];
        
        if (!establishmentSelect.value) {
            alert('Please select an establishment first.');
            return;
        }
        
        this.selectedEstablishmentId = establishmentSelect.value;
        this.selectedEstablishmentName = selectedOption.textContent;
        
        Utils.log(`Loading dashboard for establishment: ${this.selectedEstablishmentName} (${this.selectedEstablishmentId})`);
        
        // Update UI
        const currentViewingDiv = document.getElementById('current-establishment-viewing');
        const currentNameSpan = document.getElementById('current-establishment-name');
        if (currentViewingDiv) currentViewingDiv.style.display = 'flex';
        if (currentNameSpan) currentNameSpan.textContent = this.selectedEstablishmentName;
        
        // Show all sections
        document.getElementById('overview-section').style.display = 'block';
        document.getElementById('qla-section').style.display = 'block';
        document.getElementById('student-insights-section').style.display = 'block';
        
        // Load data
        await this.loadDashboardWithEstablishment(this.selectedEstablishmentId, this.selectedEstablishmentName);
    },

    async loadDashboardWithEstablishment(establishmentId, establishmentName) {
        Utils.log(`Loading dashboard data for VESPA Customer: ${establishmentName} (${establishmentId})`);
        
        GlobalLoader.init();
        GlobalLoader.updateProgress(10, `Loading data for ${establishmentName}...`);
        
        try {
            const cycleSelect = document.getElementById('cycle-select');
            const initialCycle = cycleSelect ? parseInt(cycleSelect.value, 10) : 1;
            
            // Fetch all initial data using batch endpoint
            GlobalLoader.updateProgress(30, 'Fetching dashboard data...');
            const batchData = await API.fetchDashboardInitialData(null, establishmentId, initialCycle);
            
            // Populate filter dropdowns from cached data
            GlobalLoader.updateProgress(50, 'Setting up filters...');
            Filters.populateFilterDropdownsFromCache(batchData.filterOptions);
            
            // Initialize all modules with establishment filter
            GlobalLoader.updateProgress(70, 'Rendering visualizations...');
            await Promise.all([
                Overview.init(null, establishmentId),
                QLA.init(null, establishmentId),
                Insights.init(null, establishmentId)
            ]);
            
            GlobalLoader.updateProgress(90, 'Finalizing...');
            GlobalLoader.updateProgress(100, 'Dashboard ready!');
            setTimeout(() => GlobalLoader.hide(), 500);
            
        } catch (error) {
            Utils.errorLog("Failed to load establishment dashboard", error);
            GlobalLoader.hide();
            this.showError(`Error loading dashboard for ${establishmentName}: ${error.message}`);
        }
    },

    showError(message) {
        const sections = ['overview-section', 'qla-section', 'student-insights-section'];
        sections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.innerHTML = `<p class="error-message">${message}</p>`;
            }
        });
    },

    // Modal functions
    showERIInfoModal() {
        // Implementation for ERI info modal
        // (Copy the modal code from the original file)
    },

    hideERIInfoModal() {
        const modal = document.querySelector('.eri-info-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    },

    hideStatsPanel() {
        const overlay = document.querySelector('.stats-panel-overlay');
        const panel = document.querySelector('.stats-panel');
        
        if (overlay) overlay.classList.remove('active');
        if (panel) panel.classList.remove('active');
        
        setTimeout(() => {
            if (overlay && !overlay.classList.contains('active')) overlay.remove();
            if (panel && !panel.classList.contains('active')) panel.remove();
        }, 400);
    },

    showStatsInfoModal() {
        // Implementation for stats info modal
        // (Copy the modal code from the original file)
    },

    hideStatsInfoModal() {
        const modal = document.querySelector('.stats-info-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    }
};

// Initialize when DOM is ready
function initializeDashboardApp() {
    DashboardApp.init();
}

// Make initialization function globally available
window.initializeDashboardApp = initializeDashboardApp;

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboardApp);
} else {
    // DOM is already ready
    initializeDashboardApp();
}
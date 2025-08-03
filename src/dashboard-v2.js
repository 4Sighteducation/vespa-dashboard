/**
 * VESPA Dashboard v2 - Built for Supabase Pre-calculated Statistics
 * This version is designed to work with pre-calculated data for optimal performance
 */

function initializeDashboardApp() {
    console.log('Initializing VESPA Dashboard v2 (Supabase Edition)');
    
    // Configuration
    const config = window.DASHBOARD_CONFIG || {
        herokuAppUrl: 'https://vespa-dashboard-9a1f84ee5341.herokuapp.com',
        debugMode: true
    };
    
    // Current state
    let currentUser = null;
    let currentEstablishment = null;
    let currentCycle = 1;
    let isSuperUser = false;
    let isStaffAdmin = false;
    
    // Logging helpers
    function log(message, data) {
        if (config.debugMode) {
            console.log(`[Dashboard v2] ${message}`, data || '');
        }
    }
    
    function error(message, err) {
        console.error(`[Dashboard v2 ERROR] ${message}`, err || '');
    }
    
    // API Helper
    const API = {
        async fetch(url, options = {}) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                return await response.json();
            } catch (err) {
                error(`Failed to fetch ${url}`, err);
                throw err;
            }
        },
        
        async getSchools() {
            return this.fetch(`${config.herokuAppUrl}/api/schools`);
        },
        
        async getStatistics(establishmentId, cycle) {
            return this.fetch(`${config.herokuAppUrl}/api/statistics?establishment_id=${establishmentId}&cycle=${cycle}`);
        },
        
        async getNationalStatistics(cycle) {
            return this.fetch(`${config.herokuAppUrl}/api/national-statistics?cycle=${cycle}`);
        },
        
        async checkSuperUser(email) {
            return this.fetch(`${config.herokuAppUrl}/api/check-super-user?email=${encodeURIComponent(email)}`);
        },
        
        async getStaffAdmin(email) {
            return this.fetch(`${config.herokuAppUrl}/api/staff-admin/${encodeURIComponent(email)}`);
        },
        
        async getQLAData(establishmentId, cycle) {
            return this.fetch(`${config.herokuAppUrl}/api/qla?establishment_id=${establishmentId}&cycle=${cycle}`);
        }
    };
    
    // Initialize dashboard
    async function init() {
        try {
            // Get current user
            currentUser = Knack.getUserAttributes();
            if (!currentUser) {
                error('No user found');
                return;
            }
            
            log('Current user:', currentUser);
            const userEmail = currentUser.email;
            
            // Check user role
            const [staffAdminCheck, superUserCheck] = await Promise.all([
                API.getStaffAdmin(userEmail).catch(() => null),
                API.checkSuperUser(userEmail)
            ]);
            
            if (staffAdminCheck && staffAdminCheck.field_110_raw?.length > 0) {
                isStaffAdmin = true;
                currentEstablishment = staffAdminCheck.field_110_raw[0].id;
                log('User is Staff Admin for establishment:', currentEstablishment);
                
                // Load dashboard for their school
                await loadDashboard(currentEstablishment);
                
            } else if (superUserCheck.is_super_user) {
                isSuperUser = true;
                log('User is Super User');
                
                // Show school selector
                await showSchoolSelector();
                
            } else {
                error('User has no dashboard access');
                showError('You do not have permission to view this dashboard.');
            }
            
        } catch (err) {
            error('Failed to initialize dashboard', err);
            showError('Failed to load dashboard. Please refresh the page.');
        }
    }
    
    // Show school selector for super users
    async function showSchoolSelector() {
        const container = document.getElementById('dashboard-container');
        container.innerHTML = `
            <div class="super-user-controls">
                <div class="super-user-header">
                    <span class="super-user-badge">⚡ Super User Mode</span>
                    <span class="super-user-title">Select School to View</span>
                </div>
                <div class="super-user-form">
                    <select id="school-select" disabled>
                        <option>Loading schools...</option>
                    </select>
                    <button id="load-school-btn" disabled>Load Dashboard</button>
                </div>
            </div>
            <div id="dashboard-content" style="display: none;"></div>
        `;
        
        try {
            const schools = await API.getSchools();
            const select = document.getElementById('school-select');
            
            select.innerHTML = '<option value="">Select a school...</option>';
            schools.forEach(school => {
                const option = document.createElement('option');
                option.value = school.id;
                option.textContent = school.name;
                select.appendChild(option);
            });
            
            select.disabled = false;
            document.getElementById('load-school-btn').disabled = false;
            
            // Add event listeners
            document.getElementById('load-school-btn').addEventListener('click', async () => {
                const schoolId = select.value;
                if (schoolId) {
                    currentEstablishment = schoolId;
                    await loadDashboard(schoolId);
                }
            });
            
        } catch (err) {
            error('Failed to load schools', err);
            showError('Failed to load schools list.');
        }
    }
    
    // Main dashboard loader
    async function loadDashboard(establishmentId) {
        log('Loading dashboard for establishment:', establishmentId);
        
        const container = isSuperUser ? 
            document.getElementById('dashboard-content') : 
            document.getElementById('dashboard-container');
            
        // Show loading state
        container.innerHTML = `
            <div id="loading-indicator">
                <div class="spinner"></div>
                <p>Loading dashboard data...</p>
            </div>
        `;
        
        if (isSuperUser) {
            container.style.display = 'block';
        }
        
        try {
            // Fetch data in parallel
            const [schoolStats, nationalStats] = await Promise.all([
                API.getStatistics(establishmentId, currentCycle),
                API.getNationalStatistics(currentCycle)
            ]);
            
            log('School stats:', schoolStats);
            log('National stats:', nationalStats);
            
            // Render dashboard
            renderDashboard(container, schoolStats, nationalStats);
            
        } catch (err) {
            error('Failed to load dashboard data', err);
            showError('Failed to load dashboard data.');
        }
    }
    
    // Render the dashboard
    function renderDashboard(container, schoolData, nationalData) {
        // Extract statistics
        const schoolStats = schoolData.statistics || {};
        const nationalStats = nationalData.statistics || {};
        
        // Build dashboard HTML
        container.innerHTML = `
            <header>
                <h1>VESPA Dashboard - ${schoolData.establishment_name || 'School'}</h1>
                <div class="controls">
                    <div class="controls-left">
                        <label for="cycle-select">Cycle:</label>
                        <select id="cycle-select">
                            <option value="1" ${currentCycle === 1 ? 'selected' : ''}>Cycle 1</option>
                            <option value="2" ${currentCycle === 2 ? 'selected' : ''}>Cycle 2</option>
                            <option value="3" ${currentCycle === 3 ? 'selected' : ''}>Cycle 3</option>
                        </select>
                    </div>
                    <div class="controls-right">
                        <div class="response-stats-card">
                            <div class="response-stats-content">
                                <div class="stat-item">
                                    <div class="stat-label">RESPONSES</div>
                                    <div class="stat-value">${schoolStats.overall?.count || 0}</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">STUDENTS</div>
                                    <div class="stat-value">${schoolStats.overall?.count || 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            
            <section id="overview-section">
                <h2>VESPA Overview</h2>
                <div class="vespa-combined-grid" id="vespa-grid">
                    <!-- VESPA cards will be inserted here -->
                </div>
            </section>
            
            <section id="qla-section">
                <h2>Question Level Analysis</h2>
                <div id="qla-content">
                    <p>Loading question analysis...</p>
                </div>
            </section>
        `;
        
        // Render VESPA cards
        renderVespaCards(schoolStats, nationalStats);
        
        // Add cycle change listener
        document.getElementById('cycle-select').addEventListener('change', async (e) => {
            currentCycle = parseInt(e.target.value);
            await loadDashboard(currentEstablishment);
        });
        
        // Load QLA data
        loadQLAData(currentEstablishment);
    }
    
    // Render VESPA score cards
    function renderVespaCards(schoolStats, nationalStats) {
        const grid = document.getElementById('vespa-grid');
        const elements = ['vision', 'effort', 'systems', 'practice', 'attitude', 'overall'];
        const colors = {
            vision: '#ff9500',
            effort: '#007aff',
            systems: '#34c759',
            practice: '#af52de',
            attitude: '#ff3b30',
            overall: '#ffcc00'
        };
        
        grid.innerHTML = elements.map(element => {
            const school = schoolStats[element] || {};
            const national = nationalStats[element] || {};
            const diff = school.mean && national.mean ? 
                ((school.mean - national.mean) / national.mean * 100).toFixed(1) : 0;
            
            return `
                <div class="vespa-score-card">
                    <h3>${element.toUpperCase()}</h3>
                    <div class="score-value">${school.mean?.toFixed(1) || '0.0'}</div>
                    <div class="national-comparison">
                        Global: ${national.mean?.toFixed(1) || '0.0'}
                        ${diff > 0 ? `<span class="arrow up">↑</span>` : diff < 0 ? `<span class="arrow down">↓</span>` : ''}
                        ${Math.abs(diff)}%
                    </div>
                </div>
                
                <div class="chart-wrapper">
                    <canvas id="chart-${element}"></canvas>
                </div>
            `;
        }).join('');
        
        // Create simple bar charts
        elements.forEach(element => {
            createSimpleBarChart(element, schoolStats[element], nationalStats[element]);
        });
    }
    
    // Create simple bar chart
    function createSimpleBarChart(element, schoolData, nationalData) {
        const canvas = document.getElementById(`chart-${element}`);
        const ctx = canvas.getContext('2d');
        
        // Simple bar chart without Chart.js
        const width = canvas.width;
        const height = canvas.height;
        const schoolMean = schoolData?.mean || 0;
        const nationalMean = nationalData?.mean || 0;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw bars
        const barWidth = width / 3;
        const maxValue = 10;
        
        // School bar
        ctx.fillStyle = '#007aff';
        const schoolBarHeight = (schoolMean / maxValue) * height * 0.8;
        ctx.fillRect(barWidth * 0.5, height - schoolBarHeight, barWidth * 0.8, schoolBarHeight);
        
        // National bar
        ctx.fillStyle = '#34c759';
        const nationalBarHeight = (nationalMean / maxValue) * height * 0.8;
        ctx.fillRect(barWidth * 1.7, height - nationalBarHeight, barWidth * 0.8, nationalBarHeight);
        
        // Labels
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('School', barWidth * 0.9, height - 5);
        ctx.fillText('National', barWidth * 2.1, height - 5);
    }
    
    // Load QLA data
    async function loadQLAData(establishmentId) {
        try {
            const qlaData = await API.getQLAData(establishmentId, currentCycle);
            const qlaContent = document.getElementById('qla-content');
            
            if (qlaData.top_questions?.length > 0 || qlaData.bottom_questions?.length > 0) {
                qlaContent.innerHTML = `
                    <div class="qla-top-bottom-container">
                        <div class="qla-questions-section top-questions">
                            <h3>Top Performing Questions</h3>
                            <div class="question-cards">
                                ${qlaData.top_questions.map(q => `
                                    <div class="question-card excellent">
                                        <div class="question-rank">#${q.rank}</div>
                                        <div class="question-text">${q.question_text}</div>
                                        <div class="score-indicator">
                                            <div class="score-value">${q.mean_score.toFixed(2)}</div>
                                            <div class="score-label">Avg Score</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="qla-questions-section bottom-questions">
                            <h3>Areas for Improvement</h3>
                            <div class="question-cards">
                                ${qlaData.bottom_questions.map(q => `
                                    <div class="question-card poor">
                                        <div class="question-rank">#${q.rank}</div>
                                        <div class="question-text">${q.question_text}</div>
                                        <div class="score-indicator">
                                            <div class="score-value">${q.mean_score.toFixed(2)}</div>
                                            <div class="score-label">Avg Score</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                qlaContent.innerHTML = '<p>No question analysis available for this cycle.</p>';
            }
        } catch (err) {
            error('Failed to load QLA data', err);
            document.getElementById('qla-content').innerHTML = '<p>Failed to load question analysis.</p>';
        }
    }
    
    // Show error message
    function showError(message) {
        const container = document.getElementById('dashboard-container');
        container.innerHTML = `
            <div class="error-message">
                <h2>Error</h2>
                <p>${message}</p>
            </div>
        `;
    }
    
    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

// Make function available globally for Knack
window.initializeDashboardApp = initializeDashboardApp;

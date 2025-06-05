// overview.js - Overview section management
import { API } from './api.js';
import { Charts } from './charts.js';
import { Filters } from './filters.js';
import { Utils } from './utils.js';
import { GlobalLoader } from './loader.js';
import { Cache } from './cache.js';
import { Config, FieldMappings, ObjectKeys } from './config.js';

export const Overview = {
    currentStaffAdminId: null,
    currentEstablishmentId: null,
    
    async init(staffAdminId, establishmentId) {
        this.currentStaffAdminId = staffAdminId;
        this.currentEstablishmentId = establishmentId;
        
        // Load initial data
        const cycleSelect = document.getElementById('cycle-select');
        const initialCycle = cycleSelect ? parseInt(cycleSelect.value, 10) : 1;
        
        await this.loadData(staffAdminId, initialCycle, [], establishmentId);
        
        // Set up event listeners
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Cycle selector
        const cycleSelect = document.getElementById('cycle-select');
        if (cycleSelect) {
            cycleSelect.addEventListener('change', async (event) => {
                const selectedCycle = parseInt(event.target.value, 10);
                Utils.log(`Cycle changed to: ${selectedCycle}`);
                
                Cache.clear();
                const activeFilters = Filters.getActiveFilters();
                await this.loadData(this.currentStaffAdminId, selectedCycle, activeFilters, this.currentEstablishmentId);
            });
        }

        // Filter buttons
        const applyFiltersBtn = document.getElementById('apply-filters-btn');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', async () => {
                const selectedCycle = cycleSelect ? parseInt(cycleSelect.value, 10) : 1;
                const activeFilters = Filters.getActiveFilters();
                Utils.log("Applying filters:", activeFilters);
                await this.loadData(this.currentStaffAdminId, selectedCycle, activeFilters, this.currentEstablishmentId);
            });
        }

        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', async () => {
                // Clear all filter inputs
                document.getElementById('student-search').value = '';
                document.getElementById('group-filter').value = '';
                document.getElementById('course-filter').value = '';
                document.getElementById('year-group-filter').value = '';
                document.getElementById('faculty-filter').value = '';
                
                Filters.updateActiveFiltersDisplay([]);
                
                const selectedCycle = cycleSelect ? parseInt(cycleSelect.value, 10) : 1;
                Utils.log("Clearing all filters");
                await this.loadData(this.currentStaffAdminId, selectedCycle, [], this.currentEstablishmentId);
            });
        }

        // Filter toggle
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

        // ERI info button
        const eriInfoBtn = document.getElementById('eri-info-button');
        if (eriInfoBtn) {
            eriInfoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.showERIInfoModal();
            });
        }

        // Advanced stats buttons
        document.querySelectorAll('.advanced-stats-btn').forEach(btn => {
            btn.addEventListener('click', this.handleAdvancedStatsClick.bind(this));
        });
    },

    async loadData(staffAdminId, cycle = 1, additionalFilters = [], establishmentId = null) {
        Utils.log(`Loading overview data for cycle: ${cycle}`);
        const loadingIndicator = document.getElementById('loading-indicator');
        const averagesContainer = document.getElementById('averages-summary-container');
        const distributionContainer = document.getElementById('distribution-charts-container');

        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (averagesContainer) averagesContainer.style.display = 'none';
        if (distributionContainer) distributionContainer.style.display = 'none';

        try {
            // Use batch endpoint to fetch all data at once
            GlobalLoader.updateProgress(40, 'Loading dashboard data...');
            const batchData = await API.fetchDashboardInitialData(staffAdminId, establishmentId, cycle);
            
            let schoolVespaResults = batchData.vespaResults || [];
            let nationalBenchmarkRecord = batchData.nationalBenchmark;
            
            // Apply additional filters if any
            if (additionalFilters && additionalFilters.length > 0) {
                schoolVespaResults = Filters.applyFiltersToRecords(schoolVespaResults, additionalFilters);
                Utils.log(`Applied additional filters, results: ${schoolVespaResults.length}`);
            }
            
            GlobalLoader.updateProgress(60, 'Processing VESPA scores...');
            
            const schoolAverages = this.calculateSchoolVespaAverages(schoolVespaResults, cycle);
            Utils.log(`School Averages (Cycle ${cycle}):`, schoolAverages);

            let nationalAverages = { vision: 0, effort: 0, systems: 0, practice: 0, attitude: 0, overall: 0 };
            let nationalDistributions = null;
            
            if (nationalBenchmarkRecord) {
                nationalAverages = this.getNationalVespaAveragesFromRecord(nationalBenchmarkRecord, cycle);
                Utils.log("Processed National Averages for charts:", nationalAverages);
                
                // Parse national distribution JSON data
                const distributionFieldMap = {
                    1: 'field_3409',
                    2: 'field_3410',
                    3: 'field_3411'
                };
                
                const distributionField = distributionFieldMap[cycle];
                if (distributionField && nationalBenchmarkRecord[distributionField + '_raw']) {
                    try {
                        nationalDistributions = JSON.parse(nationalBenchmarkRecord[distributionField + '_raw']);
                        Utils.log(`Parsed National Distribution data for Cycle ${cycle}:`, nationalDistributions);
                    } catch (e) {
                        Utils.errorLog(`Failed to parse national distribution JSON for cycle ${cycle}:`, e);
                    }
                }
            }
            
            GlobalLoader.updateProgress(70, 'Calculating statistics...');
            
            // Update response statistics
            this.updateResponseStatsFromCache(schoolVespaResults, cycle);
            
            // ERI data
            const schoolERI = batchData.schoolERI;
            const nationalERI = batchData.nationalERI || 3.5;
            
            GlobalLoader.updateProgress(80, 'Rendering visualizations...');
            
            // Render all components
            this.renderERISpeedometer(schoolERI, nationalERI, cycle);
            this.renderAveragesChart(schoolAverages, nationalAverages, cycle);
            this.renderDistributionCharts(schoolVespaResults, nationalAverages, Config.get('themeColors'), cycle, nationalDistributions);

        } catch (error) {
            Utils.errorLog("Failed to load overview data", error);
            const overviewSection = document.getElementById('overview-section');
            if(overviewSection) overviewSection.innerHTML = "<p>Error loading overview data. Please check console.</p>";
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (averagesContainer) averagesContainer.style.display = 'block';
            if (distributionContainer) distributionContainer.style.display = 'block';
        }
    },

    calculateSchoolVespaAverages(results, cycle) {
        Utils.log(`Calculating School VESPA averages for Cycle ${cycle}`);
        
        const averages = { vision: 0, effort: 0, systems: 0, practice: 0, attitude: 0, overall: 0 };
        let validRecordsCount = 0;

        if (!Array.isArray(results) || results.length === 0) {
            Utils.log("calculateSchoolVespaAverages: Input is not a valid array or is empty", results);
            return averages;
        }

        const currentCycleFields = FieldMappings.vespaScores[`cycle${cycle}`];

        if (!currentCycleFields) {
            Utils.errorLog(`Invalid cycle number ${cycle} for school VESPA averages field mapping.`);
            return averages;
        }

        results.forEach(record => {
            const v = parseFloat(record[currentCycleFields.vision + '_raw']);
            const e = parseFloat(record[currentCycleFields.effort + '_raw']);
            const s = parseFloat(record[currentCycleFields.systems + '_raw']);
            const p = parseFloat(record[currentCycleFields.practice + '_raw']);
            const a = parseFloat(record[currentCycleFields.attitude + '_raw']);
            const o = parseFloat(record[currentCycleFields.overall + '_raw']);

            if (!isNaN(o)) {
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
    },

    getNationalVespaAveragesFromRecord(record, cycle) {
        const nationalAverages = { vision: 0, effort: 0, systems: 0, practice: 0, attitude: 0, overall: 0 };
        if (!record) return nationalAverages;

        const currentCycleFields = FieldMappings.nationalBenchmarks[`cycle${cycle}`];
        if (!currentCycleFields) {
            Utils.errorLog(`Invalid cycle number ${cycle} for national VESPA averages.`);
            return nationalAverages;
        }

        nationalAverages.vision = parseFloat(record[currentCycleFields.v + '_raw']) || 0;
        nationalAverages.effort = parseFloat(record[currentCycleFields.e + '_raw']) || 0;
        nationalAverages.systems = parseFloat(record[currentCycleFields.s + '_raw']) || 0;
        nationalAverages.practice = parseFloat(record[currentCycleFields.p + '_raw']) || 0;
        nationalAverages.attitude = parseFloat(record[currentCycleFields.a + '_raw']) || 0;
        nationalAverages.overall = parseFloat(record[currentCycleFields.o + '_raw']) || 0;
        
        Utils.log(`Parsed National Averages from Object_120 for Cycle ${cycle}:`, nationalAverages);
        return nationalAverages;
    },

    updateResponseStatsFromCache(vespaResults, cycle) {
        const totalStudents = vespaResults.length;
        
        const visionField = FieldMappings.vespaScores[`cycle${cycle}`]?.vision;
        if (!visionField) {
            Utils.errorLog(`Invalid cycle number ${cycle} for response counting.`);
            return;
        }
        
        let responseCount = 0;
        vespaResults.forEach(record => {
            const visionScore = record[visionField + '_raw'];
            if (visionScore !== null && visionScore !== undefined && visionScore !== '') {
                responseCount++;
            }
        });
        
        const completionRate = totalStudents > 0 
            ? ((responseCount / totalStudents) * 100).toFixed(1) 
            : '0.0';
        
        const cycleResponsesElement = document.getElementById('cycle-responses');
        const totalStudentsElement = document.getElementById('total-students');
        const completionRateElement = document.getElementById('completion-rate');
        
        if (cycleResponsesElement) cycleResponsesElement.textContent = responseCount.toLocaleString();
        if (totalStudentsElement) totalStudentsElement.textContent = totalStudents.toLocaleString();
        if (completionRateElement) completionRateElement.textContent = `${completionRate}%`;
        
        Utils.log(`Response Stats - Total Students: ${totalStudents}, Responses: ${responseCount}, Completion: ${completionRate}%`);
    },

    renderERISpeedometer(schoolERI, nationalERI, cycle) {
        // Store ERI values globally for modal access
        window.currentERIData = {
            school: schoolERI,
            national: nationalERI,
            cycle: cycle
        };
        
        const eriValueDisplay = document.getElementById('eri-value-display');
        if (eriValueDisplay) {
            eriValueDisplay.textContent = schoolERI ? schoolERI.value.toFixed(1) : 'N/A';
        }
        
        // Create the small gauge chart
        setTimeout(() => {
            Charts.createCompactERIGauge(schoolERI ? schoolERI.value : null, nationalERI);
        }, 100);
    },

    renderAveragesChart(schoolData, nationalData, cycle) {
        const container = document.getElementById('averages-summary-container');
        if (!container) {
            Utils.errorLog("Averages summary container not found");
            return;
        }
        container.innerHTML = '';

        Utils.log(`Rendering averages scorecards for Cycle ${cycle}. School:`, schoolData, "National:", nationalData);

        const elementsToDisplay = [
            { key: 'vision', name: 'VISION' },
            { key: 'effort', name: 'EFFORT' },
            { key: 'systems', name: 'SYSTEMS' },
            { key: 'practice', name: 'PRACTICE' },
            { key: 'attitude', name: 'ATTITUDE' },
            { key: 'overall', name: 'OVERALL' }
        ];

        elementsToDisplay.forEach(element => {
            const schoolScore = schoolData[element.key];
            const nationalScore = nationalData[element.key];

            const card = document.createElement('div');
            card.className = 'vespa-score-card';

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
                    percentageDiffText = 'Nat Avg 0';
                } else {
                    percentageDiffText = 'Nat N/A';
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
                    National: ${nationalScoreToDisplay} <span class="arrow ${arrowClass}">${arrow}</span> ${percentageDiffText}
                </div>
            `;
            container.appendChild(card);
        });
        
        // Re-attach event listeners for new buttons
        container.querySelectorAll('.advanced-stats-btn').forEach(btn => {
            btn.addEventListener('click', this.handleAdvancedStatsClick.bind(this));
        });
    },

    renderDistributionCharts(schoolResults, nationalAveragesData, themeColorsConfig, cycle, nationalDistributions) {
        const container = document.getElementById('distribution-charts-container');
        if (!container) {
            Utils.errorLog("Distribution charts container not found");
            return;
        }
        Utils.log(`Rendering distribution charts for Cycle ${cycle}.`);

        const vespaElements = [
            { name: 'Vision', key: 'vision', color: themeColorsConfig?.vision || '#ff8f00' },
            { name: 'Effort', key: 'effort', color: themeColorsConfig?.effort || '#86b4f0' },
            { name: 'Systems', key: 'systems', color: themeColorsConfig?.systems || '#72cb44' },
            { name: 'Practice', key: 'practice', color: themeColorsConfig?.practice || '#7f31a4' },
            { name: 'Attitude', key: 'attitude', color: themeColorsConfig?.attitude || '#f032e6' },
            { name: 'Overall', key: 'overall', color: themeColorsConfig?.overall || '#ffd93d' }
        ];

        vespaElements.forEach(element => {
            const scoreDistribution = Array(11).fill(0);
            const scoreFieldKey = FieldMappings.vespaScores[`cycle${cycle}`][element.key] + '_raw';

            if (!schoolResults || schoolResults.length === 0) {
                Utils.log(`No school results to process for ${element.name} distribution.`);
            } else {
                schoolResults.forEach(record => {
                    const score = parseFloat(record[scoreFieldKey]);
                    if (!isNaN(score) && score >= 0 && score <= 10) {
                        scoreDistribution[Math.round(score)]++;
                    }
                });
            }
            
            const nationalAverageForElement = nationalAveragesData ? nationalAveragesData[element.key] : null;
            const canvasId = `${element.key}-distribution-chart`;
            const chartTitle = `${element.name} Score Distribution - Cycle ${cycle}`;

            Utils.log(`For ${element.name} Distribution - National Avg: ${nationalAverageForElement}`);

            Charts.createSingleHistogram(canvasId, chartTitle, scoreDistribution, nationalAverageForElement, element.color, cycle, element.key, nationalDistributions);
        });
    },

    async handleAdvancedStatsClick(event) {
        const button = event.currentTarget;
        const elementKey = button.dataset.element;
        const cycle = parseInt(button.dataset.cycle);

        Utils.log(`Opening advanced stats for ${elementKey} - Cycle ${cycle}`);

        // Show loading state
        this.showStatsPanel(elementKey, cycle, true);

        try {
            // Get current school results (filtered)
            const activeFilters = Filters.getActiveFilters();
            let schoolResults = Cache.get('vespaResults') || [];
            
            if (activeFilters && activeFilters.length > 0) {
                schoolResults = Filters.applyFiltersToRecords(schoolResults, activeFilters);
            }

            // Calculate school statistics
            const schoolStats = this.calculateSchoolStatistics(schoolResults, cycle, elementKey);

            // Get national statistics from cached data
            let nationalStats = null;
            const nationalBenchmark = Cache.get('nationalBenchmark');
            
            if (nationalBenchmark) {
                const statsFieldMap = {
                    1: 'field_3429',
                    2: 'field_3430',
                    3: 'field_3421'
                };
                
                const statsField = statsFieldMap[cycle];
                if (statsField && nationalBenchmark[statsField + '_raw']) {
                    try {
                        const allStats = JSON.parse(nationalBenchmark[statsField + '_raw']);
                        const elementName = elementKey.charAt(0).toUpperCase() + elementKey.slice(1);
                        nationalStats = allStats[elementName];
                    } catch (e) {
                        Utils.errorLog(`Failed to parse national statistics for cycle ${cycle}:`, e);
                    }
                }
            }

            // Update panel with data
            this.updateStatsPanel(elementKey, cycle, schoolStats, nationalStats);

        } catch (error) {
            Utils.errorLog("Error loading advanced statistics:", error);
            this.updateStatsPanel(elementKey, cycle, null, null, error.message);
        }
    },

    showStatsPanel(elementKey, cycle, isLoading = false) {
        // Implementation moved to UI module or kept inline
        // This is just a placeholder - you'd implement the full panel display here
        Utils.log(`Showing stats panel for ${elementKey} - Cycle ${cycle} (loading: ${isLoading})`);
    },

    updateStatsPanel(elementKey, cycle, schoolStats, nationalStats, error = null) {
        // Implementation for updating the stats panel
        Utils.log(`Updating stats panel for ${elementKey} - Cycle ${cycle}`, { schoolStats, nationalStats, error });
    },

    calculateSchoolStatistics(schoolResults, cycle, elementKey) {
        const cycleFields = FieldMappings.vespaScores[`cycle${cycle}`];
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

        return this.calculateStatistics(values);
    },

    calculateStatistics(values) {
        if (!values || values.length === 0) {
            return null;
        }

        const sorted = values.slice().sort((a, b) => a - b);
        const n = sorted.length;

        const mean = values.reduce((sum, val) => sum + val, 0) / n;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        const percentile = (p) => {
            const index = (p / 100) * (n - 1);
            const lower = Math.floor(index);
            const upper = Math.ceil(index);
            const weight = index % 1;
            return sorted[lower] * (1 - weight) + sorted[upper] * weight;
        };

        const skewness = n > 2 ? 
            (values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n) : 0;

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
};
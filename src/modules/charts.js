// charts.js - Chart creation utilities
import { Config, FieldMappings } from './config.js';
import { Utils } from './utils.js';

export const Charts = {
    // Store chart instances
    instances: {
        vespaDistribution: {},
        eriGauge: null,
        eriCompactGauge: null
    },

    // Destroy all chart instances
    destroyAll() {
        Object.values(this.instances.vespaDistribution).forEach(chart => {
            if (chart) chart.destroy();
        });
        if (this.instances.eriGauge) this.instances.eriGauge.destroy();
        if (this.instances.eriCompactGauge) this.instances.eriCompactGauge.destroy();
        
        this.instances = {
            vespaDistribution: {},
            eriGauge: null,
            eriCompactGauge: null
        };
    },

    createCompactERIGauge(schoolValue, nationalValue) {
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
            const interpretation = this.getERIInterpretationText(schoolValue);
            eriInterpretationText.textContent = interpretation;
        }
        
        // Destroy previous chart if exists
        if (this.instances.eriCompactGauge) {
            this.instances.eriCompactGauge.destroy();
        }
        
        // Determine color based on value
        let gaugeColor = '#ef4444'; // red
        if (schoolValue >= 4) gaugeColor = '#3b82f6'; // blue
        else if (schoolValue >= 3) gaugeColor = '#10b981'; // green
        else if (schoolValue >= 2) gaugeColor = '#f59e0b'; // orange
        
        // Use doughnut chart for gauge
        this.instances.eriCompactGauge = new Chart(ctx, {
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
    },

    getERIInterpretationText(eriValue) {
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
    },

    createSingleHistogram(canvasId, title, schoolScoreDistribution, nationalAverageScore, color, cycle, elementKey, nationalDistributions) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            Utils.errorLog(`Canvas element ${canvasId} not found for histogram.`);
            return;
        }
        const ctx = canvas.getContext('2d');

        // Destroy previous chart instance if it exists
        if (this.instances.vespaDistribution[canvasId]) {
            this.instances.vespaDistribution[canvasId].destroy();
        }

        const labels = Array.from({ length: 11 }, (_, i) => i.toString()); // Scores 0-10

        // Prepare national distribution data if available
        let nationalDistributionData = null;
        let nationalPatternData = null;
        if (nationalDistributions && elementKey) {
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
                nationalDistributionData = labels.map(label => {
                    return nationalDistributions[elementName][label] || 0;
                });
                
                const schoolMax = Math.max(...schoolScoreDistribution);
                const nationalMax = Math.max(...nationalDistributionData);
                
                if (nationalMax > 0 && schoolMax > 0) {
                    const scaleFactor = schoolMax / nationalMax * 0.8;
                    nationalPatternData = nationalDistributionData.map(value => value * scaleFactor);
                    Utils.log(`Scaled national pattern for ${elementName} with factor ${scaleFactor}`);
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
            order: 2
        }];

        // Add national distribution pattern as a line if data is available
        if (nationalPatternData) {
            datasets.push({
                label: 'National Pattern',
                data: nationalPatternData,
                type: 'line',
                borderColor: 'rgba(255, 217, 61, 0.5)',
                backgroundColor: 'rgba(255, 217, 61, 0.05)',
                borderWidth: 2,
                borderDash: [8, 4],
                pointRadius: 2,
                pointBackgroundColor: 'rgba(255, 217, 61, 0.5)',
                pointBorderColor: 'rgba(255, 217, 61, 0.7)',
                tension: 0.4,
                order: 1
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
                        display: nationalPatternData ? true : false,
                        labels: {
                            color: '#a8b2d1',
                            usePointStyle: true,
                            padding: 10,
                            font: {
                                size: 11
                            }
                        }
                    },
                    datalabels: {
                        display: false
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
                        ticks: {
                            color: '#a8b2d1',
                            stepSize: 1,
                            callback: function(value) { 
                                if (Number.isInteger(value)) { 
                                    return value; 
                                } 
                            }
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

        // Add national average line if available
        if (nationalAverageScore !== null && typeof nationalAverageScore !== 'undefined') {
            // Try to add annotation if plugin is available
            if (chartConfig.options.plugins.annotation) {
                chartConfig.options.plugins.annotation = {
                    annotations: {
                        [`nationalAvgLine-${elementKey}`]: {
                            type: 'line',
                            xMin: nationalAverageScore,
                            xMax: nationalAverageScore,
                            borderColor: '#ffd93d',
                            borderWidth: 3,
                            borderDash: [8, 4],
                            label: {
                                enabled: true,
                                content: `Nat Avg: ${nationalAverageScore.toFixed(1)}`,
                                position: 'start',
                                backgroundColor: 'rgba(255, 217, 61, 0.9)',
                                font: { 
                                    weight: 'bold',
                                    size: 12
                                },
                                color: '#0f0f23',
                                padding: 4
                            }
                        }
                    }
                };
            } else {
                // Fallback: add to title
                chartConfig.options.plugins.title.text += ` (Nat Avg: ${nationalAverageScore.toFixed(2)})`;
            }
        }

        Utils.log(`Creating histogram for ${canvasId} with title: '${chartConfig.options.plugins.title.text}'`);

        try {
            this.instances.vespaDistribution[canvasId] = new Chart(ctx, chartConfig);
        } catch (e) {
            Utils.errorLog(`Error creating histogram for ${canvasId}:`, e);
        }
    }
};
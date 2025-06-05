// insights.js - Student Comment Insights module
import { API } from './api.js';
import { Utils } from './utils.js';
import { Cache } from './cache.js';
import { ObjectKeys } from './config.js';

export const Insights = {
    allComments: [],
    
    async init(staffAdminId, establishmentId = null) {
        Utils.log(`Initializing Insights module`);
        await this.loadData(staffAdminId, establishmentId);
    },

    async loadData(staffAdminId, establishmentId = null) {
        Utils.log(`Loading student comment insights`);
        try {
            let vespaResults = [];
            const filters = [];
            
            if (establishmentId) {
                filters.push({
                    field: 'field_133',
                    operator: 'is',
                    value: establishmentId
                });
            } else if (staffAdminId) {
                filters.push({
                    field: 'field_439', 
                    operator: 'is',
                    value: staffAdminId
                });
            }
            
            // Try to get from cache first
            vespaResults = Cache.get('vespaResults');
            if (!vespaResults) {
                vespaResults = await API.fetchDataFromKnack(ObjectKeys.vespaResults, filters);
            }
            
            Utils.log("Processing comments from VESPA Results:", vespaResults ? vespaResults.length : 0);
            
            this.allComments = [];
            if (vespaResults && vespaResults.length > 0) {
                vespaResults.forEach(record => {
                    if (record.field_2302_raw) this.allComments.push(record.field_2302_raw); // RRC1
                    if (record.field_2303_raw) this.allComments.push(record.field_2303_raw); // RRC2
                    if (record.field_2304_raw) this.allComments.push(record.field_2304_raw); // RRC3
                    if (record.field_2499_raw) this.allComments.push(record.field_2499_raw); // GOAL1
                    if (record.field_2493_raw) this.allComments.push(record.field_2493_raw); // GOAL2
                    if (record.field_2494_raw) this.allComments.push(record.field_2494_raw); // GOAL3
                });
            }

            Utils.log("Total comments extracted:", this.allComments.length);

            // Render visualizations
            this.renderWordCloud();
            this.identifyCommonThemes();

        } catch (error) {
            Utils.errorLog("Failed to load student comment insights", error);
            const insightsSection = document.getElementById('student-insights-section');
            if(insightsSection) {
                insightsSection.innerHTML = "<p>Error loading student insights. Please check console.</p>";
            }
        }
    },

    renderWordCloud() {
        const container = document.getElementById('word-cloud-container');
        if (!container) return;
        
        Utils.log("Rendering word cloud.");
        
        // Process comments to extract word frequencies
        const wordFrequencies = this.calculateWordFrequencies();
        
        // For now, create a simple visualization
        // In production, you'd use a library like WordCloud2.js
        container.innerHTML = `
            <div class="word-cloud-placeholder">
                <h4>Word Cloud</h4>
                <p>${this.allComments.length} comments analyzed</p>
                <div class="top-words">
                    ${this.getTopWords(wordFrequencies, 10).map(([word, count]) => `
                        <span class="word-item" style="font-size: ${Math.min(2, 0.8 + (count / 10))}rem;">
                            ${word} (${count})
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    },

    calculateWordFrequencies() {
        const frequencies = {};
        const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this', 'it', 'from', 'be', 'are', 'been', 'was', 'were', 'been']);
        
        this.allComments.forEach(comment => {
            if (!comment) return;
            
            // Simple word extraction
            const words = comment.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 3 && !stopWords.has(word));
            
            words.forEach(word => {
                frequencies[word] = (frequencies[word] || 0) + 1;
            });
        });
        
        return frequencies;
    },

    getTopWords(frequencies, limit = 10) {
        return Object.entries(frequencies)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    },

    identifyCommonThemes() {
        const container = document.getElementById('common-themes-container');
        if (!container) return;
        
        Utils.log("Identifying common themes.");
        
        // Simple theme identification based on keywords
        const themes = this.extractThemes();
        
        container.innerHTML = `
            <div class="themes-analysis">
                <h4>Common Themes</h4>
                <div class="themes-grid">
                    ${themes.map(theme => `
                        <div class="theme-card">
                            <div class="theme-icon">${theme.icon}</div>
                            <h5>${theme.name}</h5>
                            <p>${theme.count} mentions</p>
                            <div class="theme-keywords">
                                ${theme.keywords.slice(0, 3).join(', ')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    extractThemes() {
        // Define theme keywords
        const themeDefinitions = [
            {
                name: 'Study Habits',
                icon: '📚',
                keywords: ['study', 'revision', 'homework', 'practice', 'prepare', 'review'],
                count: 0
            },
            {
                name: 'Support & Help',
                icon: '🤝',
                keywords: ['help', 'support', 'teacher', 'tutor', 'guidance', 'assistance'],
                count: 0
            },
            {
                name: 'Confidence',
                icon: '💪',
                keywords: ['confident', 'confidence', 'believe', 'capable', 'ability', 'can'],
                count: 0
            },
            {
                name: 'Challenges',
                icon: '🎯',
                keywords: ['difficult', 'hard', 'struggle', 'challenge', 'problem', 'issue'],
                count: 0
            },
            {
                name: 'Time Management',
                icon: '⏰',
                keywords: ['time', 'schedule', 'plan', 'organize', 'deadline', 'manage'],
                count: 0
            }
        ];
        
        // Count theme occurrences
        this.allComments.forEach(comment => {
            if (!comment) return;
            const lowerComment = comment.toLowerCase();
            
            themeDefinitions.forEach(theme => {
                theme.keywords.forEach(keyword => {
                    if (lowerComment.includes(keyword)) {
                        theme.count++;
                    }
                });
            });
        });
        
        // Sort by count and return top themes
        return themeDefinitions
            .filter(theme => theme.count > 0)
            .sort((a, b) => b.count - a.count);
    }
};
// qla.js - Question Level Analysis module
import { API } from './api.js';
import { Utils } from './utils.js';
import { Cache } from './cache.js';
import { ObjectKeys } from './config.js';

export const QLA = {
    allQuestionResponses: [],
    questionMappings: { id_to_text: {}, psychometric_details: {} },
    
    async init(staffAdminId, establishmentId = null) {
        Utils.log(`Initializing QLA module`);
        await this.loadData(staffAdminId, establishmentId);
        
        // Add event listener for chat submit
        const chatSubmitBtn = document.getElementById('qla-chat-submit');
        if (chatSubmitBtn) {
            chatSubmitBtn.addEventListener('click', () => this.handleChatSubmit());
        }
    },

    async loadData(staffAdminId, establishmentId = null) {
        Utils.log(`Loading QLA data`);
        try {
            // Fetch question mappings first
            try {
                const config = window.DASHBOARD_CONFIG;
                const mappingResponse = await fetch(`${config.herokuAppUrl}/api/question-mappings`);
                if (!mappingResponse.ok) {
                    const errorData = await mappingResponse.json().catch(() => ({}));
                    throw new Error(errorData.message || `Failed to fetch question mappings: ${mappingResponse.status}`);
                }
                this.questionMappings = await mappingResponse.json();
                Utils.log("Question mappings loaded:", this.questionMappings);
            } catch (mapError) {
                Utils.errorLog("Failed to load question mappings", mapError);
            }

            // Fetch questionnaire responses
            let qlaFilters = [];
            
            if (establishmentId) {
                qlaFilters.push({
                    field: 'field_1821', 
                    operator: 'is',
                    value: establishmentId
                });
            } else if (staffAdminId) {
                qlaFilters.push({
                    field: 'field_2069', 
                    operator: 'is',
                    value: staffAdminId
                });
            }
            
            this.allQuestionResponses = await API.fetchDataFromKnack(ObjectKeys.questionnaireResponses, qlaFilters);
            Utils.log("Fetched QLA Responses:", this.allQuestionResponses ? this.allQuestionResponses.length : 0);

            // Populate UI components
            await this.populateQuestionDropdown();
            this.displayTopBottomQuestions();
            this.displayStats();

        } catch (error) {
            Utils.errorLog("Failed to load QLA data", error);
            const qlaSection = document.getElementById('qla-section');
            if(qlaSection) {
                qlaSection.innerHTML = "<p>Error loading Question Level Analysis data. Please check console.</p>";
            }
        }
    },

    async populateQuestionDropdown() {
        const dropdown = document.getElementById('qla-question-dropdown');
        if (!dropdown) return;

        try {
            const config = window.DASHBOARD_CONFIG;
            const response = await fetch(`${config.herokuAppUrl}/api/interrogation-questions`); 
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch interrogation questions');
            }
            const questions = await response.json(); 

            dropdown.innerHTML = '<option value="">Select a question...</option>';
            questions.forEach(qObj => {
                const option = document.createElement('option');
                option.value = qObj.question;
                option.textContent = qObj.question;
                dropdown.appendChild(option);
            });
            Utils.log("Populated QLA question dropdown.");
        } catch (error) {
            Utils.errorLog("Failed to populate QLA question dropdown", error);
            dropdown.innerHTML = "<option>Error loading questions</option>";
        }
    },

    displayTopBottomQuestions() {
        if (!this.allQuestionResponses || this.allQuestionResponses.length === 0) {
            Utils.log("No responses available for top/bottom questions");
            return;
        }
        
        const averageScores = this.calculateAverageScoresForQuestions();
        const questionTextMapping = this.questionMappings.id_to_text || {};

        const sortedQuestions = Object.entries(averageScores)
            .map(([fieldId, avgScore]) => ({
                id: fieldId,
                text: questionTextMapping[fieldId] || `Unknown Question (${fieldId})`,
                score: avgScore
            }))
            .sort((a, b) => b.score - a.score);

        const top5 = sortedQuestions.slice(0, 5);
        const bottom5 = sortedQuestions.slice(-5).reverse();

        // Render compact top/bottom questions
        this.renderTopBottomQuestions(top5, bottom5);
    },

    renderTopBottomQuestions(top5, bottom5) {
        const container = document.getElementById('qla-top-bottom-questions');
        if (!container) return;

        container.innerHTML = `
            <div class="qla-metrics-row">
                <div class="metric-card top-5">
                    <h4>Top Performing Questions</h4>
                    <div class="compact-list">
                        ${top5.map((q, index) => `
                            <div class="metric-item">
                                <span class="metric-rank">${index + 1}</span>
                                <span class="metric-text" title="${q.text}">${this.truncateText(q.text, 50)}</span>
                                <span class="metric-score">${q.score.toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="metric-card bottom-5">
                    <h4>Areas for Improvement</h4>
                    <div class="compact-list">
                        ${bottom5.map((q, index) => `
                            <div class="metric-item">
                                <span class="metric-rank">${index + 1}</span>
                                <span class="metric-text" title="${q.text}">${this.truncateText(q.text, 50)}</span>
                                <span class="metric-score low">${q.score.toFixed(2)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    displayStats() {
        const statsContainer = document.getElementById('qla-stats');
        if (!statsContainer) return;

        // Calculate key insights
        const insights = this.calculateKeyInsights();
        
        statsContainer.innerHTML = `
            <div class="qla-insights-grid">
                ${insights.map(insight => `
                    <div class="insight-card">
                        <div class="insight-icon ${insight.type}">
                            ${insight.icon}
                        </div>
                        <div class="insight-content">
                            <h5>${insight.title}</h5>
                            <p>${insight.value}</p>
                            <span class="insight-detail">${insight.detail}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    calculateKeyInsights() {
        const averageScores = this.calculateAverageScoresForQuestions();
        const scores = Object.values(averageScores);
        
        if (scores.length === 0) {
            return [
                {
                    type: 'info',
                    icon: '📊',
                    title: 'No Data',
                    value: 'N/A',
                    detail: 'No responses available'
                }
            ];
        }

        const avgOverall = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highPerforming = scores.filter(s => s >= 4).length;
        const lowPerforming = scores.filter(s => s < 3).length;
        const responseRate = (this.allQuestionResponses.length / scores.length * 100).toFixed(1);

        return [
            {
                type: 'primary',
                icon: '📈',
                title: 'Overall Average',
                value: avgOverall.toFixed(2),
                detail: 'Across all questions'
            },
            {
                type: 'success',
                icon: '✅',
                title: 'High Performing',
                value: highPerforming,
                detail: 'Questions scoring ≥4'
            },
            {
                type: 'warning',
                icon: '⚠️',
                title: 'Need Attention',
                value: lowPerforming,
                detail: 'Questions scoring <3'
            },
            {
                type: 'info',
                icon: '📊',
                title: 'Response Rate',
                value: `${responseRate}%`,
                detail: 'Student participation'
            }
        ];
    },

    calculateAverageScoresForQuestions() {
        const questionScores = {};
        const questionCounts = {};
        const currentQuestionTextMapping = this.questionMappings.id_to_text || {};

        if (!Array.isArray(this.allQuestionResponses) || this.allQuestionResponses.length === 0) {
            Utils.log("No valid responses for calculation");
            return {};
        }

        this.allQuestionResponses.forEach(record => {
            for (const fieldKeyInRecord in record) {
                if (fieldKeyInRecord.startsWith('field_') && fieldKeyInRecord.endsWith('_raw')) {
                    const baseFieldId = fieldKeyInRecord.replace('_raw', '');
                    
                    if (currentQuestionTextMapping[baseFieldId] || this.isFieldInPsychometricDetails(baseFieldId)) {
                        const score = parseInt(record[fieldKeyInRecord], 10);
                        if (!isNaN(score) && score >= 1 && score <= 5) {
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
    },

    isFieldInPsychometricDetails(fieldId) {
        const psychometricDetails = this.questionMappings.psychometric_details;
        if (!psychometricDetails || !Array.isArray(psychometricDetails)) return false;
        return psychometricDetails.some(qDetail => qDetail.currentCycleFieldId === fieldId);
    },

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },

    async handleChatSubmit() {
        const inputElement = document.getElementById('qla-chat-input');
        const dropdownElement = document.getElementById('qla-question-dropdown');
        const responseContainer = document.getElementById('qla-ai-response');

        if (!inputElement || !dropdownElement || !responseContainer) return;

        const userQuery = inputElement.value.trim();
        const selectedQuestion = dropdownElement.value;
        let queryForAI = userQuery;

        if (!queryForAI && selectedQuestion) {
            queryForAI = selectedQuestion;
        }

        if (!queryForAI) {
            responseContainer.innerHTML = `<p class="error-message">Please type a question or select one from the dropdown.</p>`;
            return;
        }

        responseContainer.innerHTML = `<div class="loading-response">
            <div class="spinner-small"></div>
            <p>Analyzing your question...</p>
        </div>`;

        Utils.log("Sending QLA query to AI:", queryForAI);

        try {
            const config = window.DASHBOARD_CONFIG;
            const aiResponse = await fetch(`${config.herokuAppUrl}/api/qla-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: queryForAI, 
                    questionData: this.allQuestionResponses 
                })
            });

            if (!aiResponse.ok) {
                const errorData = await aiResponse.json();
                throw new Error(errorData.message || `AI request failed with status ${aiResponse.status}`);
            }

            const result = await aiResponse.json();
            responseContainer.innerHTML = `<div class="ai-response">${result.answer}</div>`;
            Utils.log("AI Response for QLA:", result.answer);

        } catch (error) {
            Utils.errorLog("Error with QLA AI chat:", error);
            responseContainer.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
        }
    },

    analyzeQuestion(questionText) {
        // Implement specific question analysis
        Utils.log("Analyzing question:", questionText);
        // This would show detailed analysis for the selected question
    }
};
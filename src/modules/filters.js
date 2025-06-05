// filters.js - Filter management
import { Utils } from './utils.js';

export const Filters = {
    getActiveFilters() {
        const filters = [];
        const activeFilterDisplay = [];
        
        // Student search filter
        const studentSearch = document.getElementById('student-search')?.value.trim();
        if (studentSearch) {
            activeFilterDisplay.push({ type: 'Student', value: studentSearch, priority: true });
            filters.push({
                match: 'or',
                rules: [
                    {
                        field: 'field_187',
                        operator: 'contains',
                        value: studentSearch,
                        field_name: 'first'
                    },
                    {
                        field: 'field_187',
                        operator: 'contains', 
                        value: studentSearch,
                        field_name: 'last'
                    }
                ]
            });
        }
        
        // Group filter
        const groupFilter = document.getElementById('group-filter')?.value;
        const groupText = document.getElementById('group-filter')?.selectedOptions[0]?.textContent;
        if (groupFilter && groupText !== 'All Groups') {
            activeFilterDisplay.push({ type: 'Group', value: groupText });
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
        this.updateActiveFiltersDisplay(activeFilterDisplay);
        
        return filters;
    },

    updateActiveFiltersDisplay(activeFilters) {
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
    },

    populateFilterDropdownsFromCache(filterOptions) {
        if (!filterOptions) {
            Utils.log("No filter options provided to populateFilterDropdownsFromCache");
            return;
        }
        
        Utils.log("Populating filter dropdowns from cache");
        
        // Populate each dropdown
        this.populateDropdown('group-filter', filterOptions.groups || []);
        this.populateDropdown('course-filter', filterOptions.courses || []);
        this.populateDropdown('year-group-filter', filterOptions.yearGroups || []);
        this.populateDropdown('faculty-filter', filterOptions.faculties || []);
        
        Utils.log("Filter dropdowns populated from cache");
    },

    populateDropdown(dropdownId, items, displayProperty = null, valueProperty = null) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        
        // Keep the "All" option
        const allOption = dropdown.querySelector('option[value=""]');
        dropdown.innerHTML = '';
        if (allOption) dropdown.appendChild(allOption);
        
        items.forEach(item => {
            const option = document.createElement('option');
            if (typeof item === 'object' && item !== null) {
                if (displayProperty && item[displayProperty] !== undefined) {
                    option.textContent = item[displayProperty];
                    option.value = valueProperty && item[valueProperty] !== undefined ? item[valueProperty] : item[displayProperty];
                } else {
                    option.value = JSON.stringify(item);
                    option.textContent = JSON.stringify(item);
                }
            } else {
                option.value = item;
                option.textContent = item;
            }
            dropdown.appendChild(option);
        });
        
        Utils.log(`Populated ${dropdownId} with ${items.length} items`);
    },

    applyFiltersToRecords(records, filters) {
        return records.filter(record => {
            return filters.every(filter => {
                const fieldValue = record[filter.field + '_raw'] || record[filter.field];
                
                if (filter.match === 'or' && filter.rules) {
                    return filter.rules.some(rule => {
                        const ruleValue = record[rule.field + '_raw'] || record[rule.field];
                        return this.matchesFilter(ruleValue, rule.operator, rule.value, rule.field_name);
                    });
                }
                
                return this.matchesFilter(fieldValue, filter.operator, filter.value);
            });
        });
    },

    matchesFilter(fieldValue, operator, filterValue, fieldName = null) {
        if (fieldValue === null || fieldValue === undefined) return false;
        
        if (fieldName && typeof fieldValue === 'object') {
            fieldValue = fieldValue[fieldName] || '';
        }
        
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
};
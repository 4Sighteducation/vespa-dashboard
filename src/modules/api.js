// api.js - API communication layer
import { Config } from './config.js';
import { Cache } from './cache.js';

export const API = {
    async fetchDataFromKnack(objectKey, filters = [], options = {}) {
        const config = Config.getAll();
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

        console.log("Fetching from backend URL:", url);
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: `Knack API request via backend failed with status ${response.status}` 
                }));
                throw new Error(errorData.message || `Knack API request via backend failed with status ${response.status}`);
            }
            const data = await response.json();
            return data.records;
        } catch (error) {
            console.error(`Failed to fetch data for ${objectKey}`, error);
            throw error;
        }
    },

    async fetchDashboardInitialData(staffAdminId, establishmentId, cycle = 1) {
        const cacheKey = `initialData_${staffAdminId}_${establishmentId}_${cycle}`;
        const cachedData = Cache.get(cacheKey);
        
        if (cachedData && cachedData.cycle === cycle && 
            cachedData.staffAdminId === staffAdminId && 
            cachedData.establishmentId === establishmentId) {
            console.log("Using cached initial data");
            return cachedData;
        }
        
        const config = Config.getAll();
        const url = `${config.herokuAppUrl}/api/dashboard-initial-data`;
        const requestData = {
            staffAdminId,
            establishmentId,
            cycle
        };
        
        console.log("Fetching dashboard initial data from batch endpoint:", requestData);
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: `Batch data request failed with status ${response.status}` 
                }));
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
            Cache.set(cacheKey, cacheData);
            Cache.set('vespaResults', data.vespaResults);
            Cache.set('nationalBenchmark', data.nationalBenchmark);
            Cache.set('filterOptions', data.filterOptions);
            Cache.set('psychometricResponses', data.psychometricResponses);
            
            return data;
        } catch (error) {
            console.error("Failed to fetch dashboard initial data", error);
            throw error;
        }
    },

    async calculateSchoolERI(staffAdminId, cycle, additionalFilters = [], establishmentId = null) {
        const config = Config.getAll();
        console.log(`Fetching School ERI for Cycle ${cycle} from backend`);
        
        try {
            let url = `${config.herokuAppUrl}/api/calculate-eri?cycle=${cycle}`;
            
            if (establishmentId) {
                url += `&establishmentId=${establishmentId}`;
            } else if (staffAdminId) {
                url += `&staffAdminId=${staffAdminId}`;
            } else {
                console.log("No Staff Admin ID or Establishment ID provided for ERI calculation");
                return null;
            }
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: `ERI calculation failed with status ${response.status}` 
                }));
                throw new Error(errorData.message || `ERI calculation failed with status ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.school_eri === null || data.school_eri === undefined) {
                console.log("No ERI data returned from backend");
                return null;
            }
            
            console.log(`Received School ERI: ${data.school_eri} from ${data.response_count} responses`);
            
            return {
                value: data.school_eri,
                responseCount: data.response_count
            };
            
        } catch (error) {
            console.error("Failed to fetch school ERI from backend", error);
            return null;
        }
    },

    async getNationalERI(cycle) {
        const config = Config.getAll();
        console.log(`Fetching National ERI for Cycle ${cycle} from backend`);
        
        try {
            const url = `${config.herokuAppUrl}/api/national-eri?cycle=${cycle}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ 
                    message: `National ERI fetch failed with status ${response.status}` 
                }));
                throw new Error(errorData.message || `National ERI fetch failed with status ${response.status}`);
            }
            
            const data = await response.json();
            
            console.log(`Received National ERI: ${data.national_eri} (${data.source})`);
            if (data.message) {
                console.log(`National ERI message: ${data.message}`);
            }
            
            return data.national_eri;
            
        } catch (error) {
            console.error("Failed to fetch national ERI from backend", error);
            return 3.5; // Default value
        }
    }
};
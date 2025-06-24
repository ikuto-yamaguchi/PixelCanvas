// FetchHelper.js - 統一されたSupabase API呼び出しヘルパー

export class FetchHelper {
    static async supabaseFetch(url, options = {}) {
        const defaultHeaders = {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const defaultOptions = {
            mode: 'cors',
            credentials: 'omit',
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options
        };

        try {
            console.log(`🌐 Supabase API call: ${options.method || 'GET'} ${url}`);
            const response = await fetch(url, finalOptions);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            return response;
        } catch (error) {
            console.error('🚨 Supabase API Error:', {
                url,
                method: options.method || 'GET',
                error: error.message,
                options: finalOptions
            });
            throw error;
        }
    }

    static async supabaseGet(path, params = {}) {
        const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`);
        
        // Add query parameters
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value);
            }
        });

        return this.supabaseFetch(url.toString(), {
            method: 'GET'
        });
    }

    static async supabasePost(path, data) {
        return this.supabaseFetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    static async supabasePut(path, data) {
        return this.supabaseFetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    static async supabaseDelete(path) {
        return this.supabaseFetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
            method: 'DELETE'
        });
    }
}

// Make available globally
window.FetchHelper = FetchHelper;
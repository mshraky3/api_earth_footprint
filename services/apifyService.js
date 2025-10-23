import { ApifyClient } from 'apify-client';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';


const client = new ApifyClient({
    token: process.env.APIFY 
});

// Path to store the reviews JSON file
const REVIEWS_FILE_PATH = path.join(process.cwd(), 'reviews.json');
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// API call limits
const DAILY_LIMIT = 10;
const MONTHLY_LIMIT = 300;

class ApifyService {
    constructor() {
        this.lastFetchTime = null;
        this.cachedReviews = null;
    }

    // Check if cache is still valid
    isCacheValid() {
        if (!this.lastFetchTime) return false;
        const now = new Date().getTime();
        return (now - this.lastFetchTime) < CACHE_DURATION;
    }

    // Get current date string (YYYY-MM-DD)
    getCurrentDateString() {
        return new Date().toISOString().split('T')[0];
    }

    // Get current month string (YYYY-MM)
    getCurrentMonthString() {
        return new Date().toISOString().substring(0, 7);
    }

    // Check if we can make API calls
    canMakeApiCall() {
        try {
            const data = JSON.parse(fsSync.readFileSync(REVIEWS_FILE_PATH, 'utf8'));
            const today = this.getCurrentDateString();
            const thisMonth = this.getCurrentMonthString();
            
            // Check daily limit
            if (data.dailyCount && data.dailyCount.date === today && data.dailyCount.count >= DAILY_LIMIT) {
                console.log(`⚠️ Daily API limit reached: ${data.dailyCount.count}/${DAILY_LIMIT}`);
                return false;
            }
            
            // Check monthly limit
            if (data.monthlyCount && data.monthlyCount.month === thisMonth && data.monthlyCount.count >= MONTHLY_LIMIT) {
                console.log(`⚠️ Monthly API limit reached: ${data.monthlyCount.count}/${MONTHLY_LIMIT}`);
                return false;
            }
            
            return true;
        } catch (error) {
            console.log('📊 No existing counter data, allowing API call');
            return true;
        }
    }

    // Update counters
    updateCounters() {
        try {
            let data = {};
            try {
                data = JSON.parse(fsSync.readFileSync(REVIEWS_FILE_PATH, 'utf8'));
            } catch (error) {
                // File doesn't exist or is invalid, start fresh
                data = {};
            }

            const today = this.getCurrentDateString();
            const thisMonth = this.getCurrentMonthString();

            // Update daily counter
            if (!data.dailyCount || data.dailyCount.date !== today) {
                data.dailyCount = { date: today, count: 1 };
            } else {
                data.dailyCount.count += 1;
            }

            // Update monthly counter
            if (!data.monthlyCount || data.monthlyCount.month !== thisMonth) {
                data.monthlyCount = { month: thisMonth, count: 1 };
            } else {
                data.monthlyCount.count += 1;
            }

            // Save updated data
            fsSync.writeFileSync(REVIEWS_FILE_PATH, JSON.stringify(data, null, 2));
            
            console.log(`📊 API Call Counters - Daily: ${data.dailyCount.count}/${DAILY_LIMIT}, Monthly: ${data.monthlyCount.count}/${MONTHLY_LIMIT}`);
            
            return {
                daily: data.dailyCount,
                monthly: data.monthlyCount
            };
        } catch (error) {
            console.error('❌ Error updating counters:', error);
            return null;
        }
    }

    // Load reviews from JSON file
    async loadReviewsFromFile() {
        try {
            const data = await fs.readFile(REVIEWS_FILE_PATH, 'utf8');
            const parsedData = JSON.parse(data);
            
            // Check if the cached data is still valid
            if (parsedData.timestamp) {
                const cacheTime = new Date(parsedData.timestamp).getTime();
                const now = new Date().getTime();
                if ((now - cacheTime) < CACHE_DURATION) {
                    this.cachedReviews = parsedData.reviews;
                    this.lastFetchTime = cacheTime;
                    console.log('✅ Loaded reviews from cache file');
                    return parsedData.reviews;
                }
            }
            
            return parsedData.reviews || [];
        } catch (error) {
            console.log('📁 No existing reviews file found, will fetch new data');
            return [];
        }
    }

    // Save reviews to JSON file
    async saveReviewsToFile(reviews) {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                reviews: reviews,
                count: reviews.length,
                source: 'apify_google_maps'
            };
            
            await fs.writeFile(REVIEWS_FILE_PATH, JSON.stringify(data, null, 2));
            console.log('💾 Reviews saved to file successfully');
        } catch (error) {
            console.error('❌ Error saving reviews to file:', error);
        }
    }

    // Transform Apify data to our format
    transformReviews(apifyData) {
        return apifyData.map((review, index) => ({
            id: `apify_review_${index}`,
            name: review.name || 'مستخدم Google',
            rating: review.stars || 5,
            review: review.text || '',
            profileImage: null, // Apify doesn't provide profile images
            date: null, // Apify doesn't provide review dates
            source: 'Google Maps (Apify)',
            reviewUrl: review.reviewUrl || null,
            title: review.title || 'مراجعة Google Maps'
        }));
    }

    // Fetch reviews from Apify API
    async fetchReviewsFromApify() {
        try {
            console.log('🔄 Fetching reviews from Apify API...');
            
            // Prepare Actor input
            const input = {
                "startUrls": [
                    {
                        "url": "https://www.google.com/maps/place/مكتب+بصمة+الارض+للاستشارات+البيئية%E2%80%AD/@26.344222,43.973797,17z/data=!4m6!3m5!1s0x157f596476ef1083:0x1627f4ca3423d980!8m2!3d26.3442221!4d43.9737974!16s%2Fg%2F11x0qjbj_2?hl=ar&entry=ttu&g_ep=EgoyMDI1MTAyMC4wIKXMDSoASAFQAw%3D%3D"
                    }
                ],
                "maxReviews": 15,
                "reviewsSort": "newest",
                "language": "ar",
                "reviewsOrigin": "all",
                "personalData": true
            };

            // Run the Actor and wait for it to finish
            const run = await client.actor("Xb8osYTtOjlsgI6k9").call(input);
            console.log('📊 Apify run completed:', run.id);

            // Fetch results from the run's dataset
            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            console.log('📋 Retrieved items from Apify:', items.length);

            if (items && items.length > 0) {
                const transformedReviews = this.transformReviews(items);
                console.log('✅ Successfully transformed reviews:', transformedReviews.length);
                
                // Save to file for future use
                await this.saveReviewsToFile(transformedReviews);
                
                return transformedReviews;
            } else {
                console.warn('⚠️ No reviews found in Apify response');
                return [];
            }
        } catch (error) {
            console.error('❌ Apify API error:', error);
            throw error;
        }
    }

    // Main method to get reviews (with caching and counter limits)
    async getReviews(forceRefresh = false) {
        try {
            // If cache is valid and not forcing refresh, return cached data
            if (!forceRefresh && this.isCacheValid() && this.cachedReviews) {
                console.log('📦 Returning cached reviews');
                return this.cachedReviews;
            }

            // Try to load from file first
            const fileReviews = await this.loadReviewsFromFile();
            if (fileReviews.length > 0 && !forceRefresh) {
                this.cachedReviews = fileReviews;
                this.lastFetchTime = new Date().getTime();
                console.log('📁 Returning reviews from file');
                return fileReviews;
            }

            // Check if we can make API calls (counter limits)
            if (!this.canMakeApiCall()) {
                console.log('🚫 API call limits reached, returning cached data only');
                if (fileReviews.length > 0) {
                    return fileReviews;
                }
                throw new Error('API call limits reached and no cached data available');
            }

            // If no valid cache, fetch from Apify
            console.log('🔄 Cache invalid or force refresh requested, fetching from Apify...');
            const freshReviews = await this.fetchReviewsFromApify();
            
            // Update counters after successful API call
            this.updateCounters();
            
            this.cachedReviews = freshReviews;
            this.lastFetchTime = new Date().getTime();
            
            return freshReviews;
        } catch (error) {
            console.error('❌ Error getting reviews:', error);
            
            // Try to return cached data as fallback
            if (this.cachedReviews) {
                console.log('🔄 Returning cached data as fallback');
                return this.cachedReviews;
            }
            
            // If no cache, try to load from file
            try {
                const fileReviews = await this.loadReviewsFromFile();
                if (fileReviews.length > 0) {
                    console.log('📁 Returning file data as fallback');
                    return fileReviews;
                }
            } catch (fileError) {
                console.error('❌ Could not load from file either:', fileError);
            }
            
            throw error;
        }
    }

    // Get cache status
    getCacheStatus() {
        let counterInfo = null;
        try {
            const data = JSON.parse(fsSync.readFileSync(REVIEWS_FILE_PATH, 'utf8'));
            counterInfo = {
                daily: data.dailyCount || { date: this.getCurrentDateString(), count: 0 },
                monthly: data.monthlyCount || { month: this.getCurrentMonthString(), count: 0 }
            };
        } catch (error) {
            counterInfo = {
                daily: { date: this.getCurrentDateString(), count: 0 },
                monthly: { month: this.getCurrentMonthString(), count: 0 }
            };
        }

        return {
            hasCache: !!this.cachedReviews,
            isValid: this.isCacheValid(),
            lastFetch: this.lastFetchTime,
            cacheAge: this.lastFetchTime ? new Date().getTime() - this.lastFetchTime : null,
            counters: counterInfo,
            limits: {
                daily: DAILY_LIMIT,
                monthly: MONTHLY_LIMIT
            }
        };
    }
}

// Export singleton instance
const apifyService = new ApifyService();
export default apifyService;

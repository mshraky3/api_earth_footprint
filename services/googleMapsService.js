import axios from 'axios';
import * as cheerio from 'cheerio';

class GoogleMapsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 2 * 60 * 1000; // 2 minutes cache for live data
    this.businessUrl = 'https://www.google.com/maps/place/مكتب+بصمة+الارض+للاستشارات+البيئية/@26.3436164,43.974527,17z';
    this.placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4';
  }

  async getReviews() {
    try {
      console.log('🔄 Fetching live reviews from Google Maps...');

      // Check cache first
      const cached = this.cache.get('live_reviews');
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('📦 Returning cached live reviews');
        return cached.data;
      }

      // Try multiple scraping approaches
      const reviews = await this.scrapeLiveReviews();
      
      if (reviews && reviews.length > 0) {
        // Cache the live results
        this.cache.set('live_reviews', {
          data: reviews,
          timestamp: Date.now()
        });

        console.log(`✅ Live scraping successful: ${reviews.length} reviews`);
        return reviews;
      }

      // If no live data, return empty array (no static fallback)
      console.log('❌ No live reviews found');
      return [];
      
    } catch (error) {
      console.error('Live scraping error:', error);
      return [];
    }
  }

  async scrapeLiveReviews() {
    const approaches = [
      () => this.scrapeWithGoogleMapsAPI(),
      () => this.scrapeWithDirectRequest(),
      () => this.scrapeWithAlternativeURLs()
    ];

    for (const approach of approaches) {
      try {
        const reviews = await approach();
        if (reviews && reviews.length > 0) {
          return reviews;
        }
      } catch (error) {
        console.log(`⚠️ Scraping approach failed: ${error.message}`);
        continue;
      }
    }

    return [];
  }

  // Method 1: Try Google Maps API if key is available
  async scrapeWithGoogleMapsAPI() {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      throw new Error('No Google Maps API key available');
    }

    try {
      console.log('🌐 Trying Google Maps Places API...');
      
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${this.placeId}&fields=reviews&key=${apiKey}`,
        { timeout: 10000 }
      );
      
      if (response.data.result && response.data.result.reviews) {
        const reviews = response.data.result.reviews.map((review, index) => ({
          id: `api_${Date.now()}_${index}`,
          name: review.author_name,
          rating: review.rating,
          date: this.formatDate(review.time),
          review: review.text,
          profileImage: review.profile_photo_url || null,
          isLive: true,
          source: 'google_maps_api'
        }));
        
        console.log(`✅ API returned ${reviews.length} reviews`);
        return reviews;
      }
    } catch (error) {
      console.log('Google Maps API failed:', error.message);
      throw error;
    }
  }

  // Method 2: Direct scraping with enhanced headers
  async scrapeWithDirectRequest() {
    try {
      console.log('🌐 Trying direct scraping...');
      
      const response = await axios.get(this.businessUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 15000,
        maxRedirects: 5
      });

      return this.parseReviewsFromHTML(response.data);
      
    } catch (error) {
      console.log('Direct scraping failed:', error.message);
      throw error;
    }
  }

  // Method 3: Try alternative URLs
  async scrapeWithAlternativeURLs() {
    const urls = [
      'https://maps.google.com/maps?cid=117083714203564495959',
      'https://www.google.com/maps/place/?q=place_id:' + this.placeId,
      'https://www.google.com/maps/search/مكتب+بصمة+الارض+للاستشارات+البيئية'
    ];

    for (const url of urls) {
      try {
        console.log(`🌐 Trying alternative URL: ${url}`);
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
            'Referer': 'https://www.google.com/',
            'Cache-Control': 'no-cache'
          },
          timeout: 10000
        });

        const reviews = this.parseReviewsFromHTML(response.data);
        if (reviews && reviews.length > 0) {
          return reviews;
        }
      } catch (error) {
        console.log(`URL ${url} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error('All alternative URLs failed');
  }

  // Parse reviews from HTML content
  parseReviewsFromHTML(html) {
    try {
      const $ = cheerio.load(html);
      const reviews = [];

      // Look for JSON data embedded in the page
      const jsonMatches = html.match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[.*?\]);/g);
      if (jsonMatches) {
        console.log('Found embedded JSON data');
        const jsonReviews = this.extractReviewsFromJSON(jsonMatches);
        if (jsonReviews.length > 0) {
          return jsonReviews;
        }
      }

      // Try different selectors for reviews
      const selectors = [
        '.jftiEf',
        '.wiI7pd',
        '.MyEned',
        '[data-review-id]',
        '.section-review'
      ];

      for (const selector of selectors) {
        const elements = $(selector);
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        
        elements.each((index, element) => {
          try {
            const $el = $(element);
            
            const name = $el.find('.d4r55, .TSUbDb, .author-name').first().text().trim() || `Reviewer ${index + 1}`;
            const rating = this.extractRating($el);
            const date = $el.find('.rsqaWe, .DU9Pgb, .p2TkOb, .review-date').first().text().trim() || 'Recently';
            const reviewText = $el.find('.wiI7pd, .MyEned, .Jtu6Td, .review-text').first().text().trim();
            const profileImg = $el.find('img[data-src], img[src]').first().attr('data-src') || 
                             $el.find('img[data-src], img[src]').first().attr('src');

            if (reviewText && reviewText.length > 10) {
              reviews.push({
                id: `live_${Date.now()}_${index}`,
                name: name,
                rating: rating,
                date: date,
                review: reviewText,
                profileImage: profileImg,
                isLive: true,
                source: 'web_scraping',
                scrapedAt: new Date().toISOString()
              });
            }
          } catch (error) {
            console.log('Error parsing review element:', error.message);
          }
        });

        if (reviews.length > 0) {
          console.log(`✅ Parsed ${reviews.length} reviews from HTML`);
          return reviews;
        }
      }

      return [];
    } catch (error) {
      console.error('HTML parsing error:', error);
      return [];
    }
  }

  // Extract rating from element
  extractRating($el) {
    const ratingElement = $el.find('.kvMYJc, .Fam1ne, [aria-label*="star"], .rating').first();
    if (ratingElement.length) {
      const ratingText = ratingElement.attr('aria-label') || ratingElement.text();
      const ratingMatch = ratingText.match(/(\d+)/);
      return ratingMatch ? parseInt(ratingMatch[1]) : 5;
    }
    return 5;
  }

  // Extract reviews from embedded JSON
  extractReviewsFromJSON(jsonMatches) {
    try {
      for (const match of jsonMatches) {
        const jsonStr = match.replace(/window\.APP_INITIALIZATION_STATE\s*=\s*/, '').replace(/;$/, '');
        const data = JSON.parse(jsonStr);
        
        // Navigate the complex JSON structure to find reviews
        // This is a simplified approach - you'd need to traverse the actual structure
        console.log('Parsed JSON data structure');
      }
    } catch (error) {
      console.log('Failed to parse JSON data:', error.message);
    }
    return [];
  }

  // Format date from timestamp
  formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `قبل ${diffDays} أيام`;
    if (diffDays < 30) return `قبل ${Math.ceil(diffDays / 7)} أسابيع`;
    if (diffDays < 365) return `قبل ${Math.ceil(diffDays / 30)} أشهر`;
    return `قبل ${Math.ceil(diffDays / 365)} سنوات`;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    console.log('Live reviews cache cleared');
  }
}

export default new GoogleMapsService();
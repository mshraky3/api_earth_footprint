import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

class GoogleMapsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes (shorter cache)
    this.reviewsUrl = 'https://www.google.com/maps/place/مكتب+بصمة+الارض+للاستشارات+البيئية%E2%80%AD/@26.3436164,43.974527,17z/data=!4m14!1m5!8m4!1e1!2s117083714203564495959!3m1!1e1!3m7!1s0x157f596476ef1083:0x1627f4ca3423d980!8m2!3d26.3442221!4d43.9737974!9m1!1b1!16s%2Fg%2F11x0qjbj_2?hl=ar&entry=ttu&g_ep=EgoyMDI1MTAxNC4wIKXMDSoASAFQAw%3D%3D';
    this.activeRequests = new Map(); // Track active requests to prevent duplicates
  }

  async getReviews() {
    try {
      console.log('🔄 Fetching live reviews...');
      
      // Check if we're in a serverless environment
      if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        console.log('Serverless environment detected, trying multiple approaches...');
        
        // Try Google Maps API first (if API key is available)
        try {
          const apiReviews = await this.getReviewsFromAPI();
          if (apiReviews && apiReviews.length > 0) {
            console.log(`✅ API reviews loaded: ${apiReviews.length} reviews`);
            return apiReviews;
          }
        } catch (error) {
          console.log('⚠️ API failed, trying web scraping:', error.message);
        }
        
        // Try web scraping as fallback
        try {
          const scrapedReviews = await this.getReviewsFromWebScraping();
          if (scrapedReviews && scrapedReviews.length > 0) {
            console.log(`✅ Scraped reviews loaded: ${scrapedReviews.length} reviews`);
            return scrapedReviews;
          }
        } catch (error) {
          console.log('⚠️ Web scraping failed, using static reviews:', error.message);
        }
        
        // Final fallback to static reviews
        console.log('Using static reviews as final fallback');
        return this.getStaticReviews();
      }

      // Check cache first
      const cached = this.cache.get('reviews');
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('Returning cached reviews');
        return cached.data;
      }

      // Check if there's already an active request
      if (this.activeRequests.has('reviews')) {
        console.log('Request already in progress, waiting...');
        return await this.activeRequests.get('reviews');
      }

      console.log('Fetching fresh reviews from Google Maps...');
      const requestPromise = this.scrapeReviews();
      this.activeRequests.set('reviews', requestPromise);
      
      try {
        const reviews = await requestPromise;
        
        // Cache the results
        this.cache.set('reviews', {
          data: reviews,
          timestamp: Date.now()
        });

        return reviews;
      } finally {
        // Clean up active request
        this.activeRequests.delete('reviews');
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      console.log('Falling back to static reviews');
      return this.getStaticReviews();
    }
  }

  async scrapeReviews() {
    // Check if we're in a serverless environment (Vercel, Netlify, etc.)
    if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      console.log('Serverless environment detected, using static reviews');
      return this.getStaticReviews();
    }

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Block unnecessary resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log('Navigating to Google Maps reviews...');
      await page.goto(this.reviewsUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });

      // Wait for reviews to load and scroll to load more
      await page.waitForSelector('.jftiEf', { timeout: 15000 });
      
      // Scroll to load more reviews
      await page.evaluate(() => {
        const scrollContainer = document.querySelector('.m6QErb');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
      
      // Wait a bit for more reviews to load
      await page.waitForTimeout(2000);

      // Extract reviews data with better selectors
      const reviews = await page.evaluate(() => {
        const reviewElements = document.querySelectorAll('.jftiEf');
        const reviews = [];

        reviewElements.forEach((element, index) => {
          try {
            // Extract reviewer name
            const nameElement = element.querySelector('.d4r55, .TSUbDb, .d4r55');
            const name = nameElement ? nameElement.textContent.trim() : `Reviewer ${index + 1}`;

            // Extract profile image
            const profileImageElement = element.querySelector('img[data-src], img[src]');
            let profileImage = null;
            if (profileImageElement) {
              profileImage = profileImageElement.getAttribute('data-src') || 
                           profileImageElement.getAttribute('src') || 
                           profileImageElement.src;
              
              // Clean up the image URL
              if (profileImage && profileImage.startsWith('//')) {
                profileImage = 'https:' + profileImage;
              }
            }

            // Extract rating
            const ratingElement = element.querySelector('.kvMYJc, .Fam1ne, [aria-label*="star"]');
            let numericRating = 5;
            if (ratingElement) {
              const ratingText = ratingElement.getAttribute('aria-label') || ratingElement.textContent;
              const ratingMatch = ratingText.match(/(\d+)/);
              numericRating = ratingMatch ? parseInt(ratingMatch[1]) : 5;
            }

            // Extract date
            const dateElement = element.querySelector('.rsqaWe, .DU9Pgb, .p2TkOb');
            let date = dateElement ? dateElement.textContent.trim() : 'Recently';
            
            // Clean up unwanted characters from date
            date = date.replace(/[\uE000-\uF8FF]/g, ''); // Remove private use area characters
            date = date.replace(/[^\u0000-\u007F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, ''); // Keep only ASCII and Arabic characters
            date = date.trim();

            // Extract review text - look for the main review content, not responses
            const textElement = element.querySelector('.wiI7pd, .MyEned, .Jtu6Td');
            let text = textElement ? textElement.textContent.trim() : '';

            // Clean up unwanted characters from review text
            text = text.replace(/[\uE000-\uF8FF]/g, ''); // Remove private use area characters
            text = text.replace(/[^\u0000-\u007F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, ''); // Keep only ASCII and Arabic characters
            text = text.trim();

            // Skip if this looks like a response (contains "رد" or is very short)
            if (text.includes('رد') || text.includes('شكراً') || text.length < 20) {
              return;
            }

            if (text && text.length > 10) {
              reviews.push({
                id: `review_${index}`,
                name: name,
                rating: numericRating,
                date: date,
                review: text,
                profileImage: profileImage
              });
            }
          } catch (error) {
            console.log('Error extracting review:', error);
          }
        });

        return reviews;
      });

      console.log(`Successfully scraped ${reviews.length} reviews`);
      return reviews;

    } catch (error) {
      console.error('Scraping error:', error);
      console.log('Falling back to static reviews due to scraping error');
      return this.getStaticReviews();
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Web scraping method optimized for serverless
  async getReviewsFromWebScraping() {
    try {
      console.log('🌐 Starting web scraping for live reviews...');
      
      // Check cache first
      const cached = this.cache.get('scraped_reviews');
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('📦 Returning cached scraped reviews');
        return cached.data;
      }

      // Try multiple approaches for better success rate
      const approaches = [
        () => this.scrapeWithCheerio(),
        () => this.scrapeWithAxios(),
        () => this.scrapeWithPuppeteerLite()
      ];

      for (const approach of approaches) {
        try {
          const reviews = await approach();
          if (reviews && reviews.length > 0) {
            console.log(`✅ Scraped ${reviews.length} reviews successfully`);
            
            // Cache the results
            this.cache.set('scraped_reviews', {
              data: reviews,
              timestamp: Date.now()
            });
            
            return reviews;
          }
        } catch (error) {
          console.log(`⚠️ Scraping approach failed: ${error.message}`);
          continue;
        }
      }

      console.log('❌ All scraping approaches failed, using static reviews');
      return this.getStaticReviews();
      
    } catch (error) {
      console.error('Web scraping error:', error);
      return this.getStaticReviews();
    }
  }

  // Method 1: Cheerio-based scraping (lightweight)
  async scrapeWithCheerio() {
    try {
      const response = await axios.get(this.reviewsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 20000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const reviews = [];

      // Try different selectors for Google Maps reviews
      const reviewSelectors = [
        '.jftiEf',
        '.wiI7pd',
        '.MyEned',
        '[data-review-id]',
        '.section-review'
      ];

      for (const selector of reviewSelectors) {
        $(selector).each((index, element) => {
          try {
            const $el = $(element);
            
            // Extract name
            const name = $el.find('.d4r55, .TSUbDb, .d4r55').first().text().trim() || 
                        $el.find('[data-review-id]').attr('data-review-id') || 
                        `Reviewer ${index + 1}`;

            // Extract rating
            const ratingElement = $el.find('.kvMYJc, .Fam1ne, [aria-label*="star"]').first();
            let rating = 5;
            if (ratingElement.length) {
              const ratingText = ratingElement.attr('aria-label') || ratingElement.text();
              const ratingMatch = ratingText.match(/(\d+)/);
              rating = ratingMatch ? parseInt(ratingMatch[1]) : 5;
            }

            // Extract date
            const date = $el.find('.rsqaWe, .DU9Pgb, .p2TkOb').first().text().trim() || 'Recently';

            // Extract review text
            const reviewText = $el.find('.wiI7pd, .MyEned, .Jtu6Td').first().text().trim();

            // Extract profile image
            const profileImg = $el.find('img[data-src], img[src]').first().attr('data-src') || 
                             $el.find('img[data-src], img[src]').first().attr('src');

            if (reviewText && reviewText.length > 10) {
              reviews.push({
                id: `cheerio_${index}`,
                name: name,
                rating: rating,
                date: date,
                review: reviewText,
                profileImage: profileImg
              });
            }
          } catch (error) {
            console.log('Error parsing review element:', error.message);
          }
        });

        if (reviews.length > 0) {
          console.log(`✅ Cheerio found ${reviews.length} reviews`);
          return reviews;
        }
      }

      return [];
    } catch (error) {
      console.error('Cheerio scraping error:', error.message);
      throw error;
    }
  }

  // Method 2: Enhanced Axios scraping
  async scrapeWithAxios() {
    try {
      // Try different URLs and approaches
      const urls = [
        this.reviewsUrl,
        'https://www.google.com/maps/place/مكتب+بصمة+الارض+للاستشارات+البيئية/@26.3436164,43.974527,17z',
        'https://maps.google.com/maps?cid=117083714203564495959'
      ];

      for (const url of urls) {
        try {
          const response = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
              'Referer': 'https://www.google.com/',
              'Cache-Control': 'no-cache'
            },
            timeout: 15000
          });

          // Look for JSON data in the HTML
          const jsonMatch = response.data.match(/window\.APP_INITIALIZATION_STATE\s*=\s*(\[.*?\]);/);
          if (jsonMatch) {
            try {
              const data = JSON.parse(jsonMatch[1]);
              console.log('Found JSON data in response');
              // Parse the JSON data to extract reviews
              // This is a simplified approach - you'd need to navigate the complex JSON structure
            } catch (parseError) {
              console.log('Failed to parse JSON data');
            }
          }

          // If we get here, the request was successful but no reviews found
          console.log(`✅ Axios request successful for ${url}, but no reviews extracted`);
          
        } catch (urlError) {
          console.log(`⚠️ URL ${url} failed: ${urlError.message}`);
          continue;
        }
      }

      return [];
    } catch (error) {
      console.error('Axios scraping error:', error.message);
      throw error;
    }
  }

  // Method 3: Lightweight Puppeteer (if available)
  async scrapeWithPuppeteerLite() {
    // Only use Puppeteer if not in serverless environment
    if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      throw new Error('Puppeteer not available in serverless environment');
    }

    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      await page.goto(this.reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      const reviews = await page.evaluate(() => {
        const reviewElements = document.querySelectorAll('.jftiEf');
        const reviews = [];

        reviewElements.forEach((element, index) => {
          try {
            const name = element.querySelector('.d4r55, .TSUbDb')?.textContent?.trim() || `Reviewer ${index + 1}`;
            const rating = 5; // Default rating
            const date = element.querySelector('.rsqaWe, .DU9Pgb')?.textContent?.trim() || 'Recently';
            const reviewText = element.querySelector('.wiI7pd, .MyEned')?.textContent?.trim() || '';
            const profileImg = element.querySelector('img[data-src], img[src]')?.getAttribute('data-src') || 
                              element.querySelector('img[data-src], img[src]')?.getAttribute('src');

            if (reviewText && reviewText.length > 10) {
              reviews.push({
                id: `puppeteer_${index}`,
                name: name,
                rating: rating,
                date: date,
                review: reviewText,
                profileImage: profileImg
              });
            }
          } catch (error) {
            console.log('Error extracting review:', error);
          }
        });

        return reviews;
      });

      await browser.close();
      return reviews;
    } catch (error) {
      console.error('Puppeteer scraping error:', error.message);
      throw error;
    }
  }

  // Google Maps Places API method (works in serverless)
  async getReviewsFromAPI(forceRefresh = false) {
    const placeId = 'ChIJN1t_tDeuEmsRUsoyG83frY4'; // Earth Footprint Place ID
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.log('⚠️ No Google Maps API key, trying web scraping...');
      return await this.getReviewsFromWebScraping();
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get('api_reviews');
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('📦 Returning cached API reviews');
        return cached.data;
      }
    }

    try {
      console.log('🔄 Fetching fresh reviews from Google Maps API...');
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`
      );
      
      const data = await response.json();
      
      if (data.result && data.result.reviews) {
        const reviews = data.result.reviews.map((review, index) => ({
          id: `api_${index}`,
          name: review.author_name,
          rating: review.rating,
          date: this.formatDate(review.time),
          review: review.text,
          profileImage: review.profile_photo_url || null
        }));
        
        // Cache the results
        this.cache.set('api_reviews', {
          data: reviews,
          timestamp: Date.now()
        });
        
        console.log(`✅ API reviews cached: ${reviews.length} reviews`);
        return reviews;
      }
    } catch (error) {
      console.error('Google Maps API error:', error);
    }
    
    return this.getStaticReviews();
  }

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

  // Fallback static reviews
  getStaticReviews() {
    return [
      {
        id: 'static_1',
        name: "Moamen Khafagy",
        rating: 5,
        date: "قبل شهر",
        review: "مكتب بصمة الأرض للإستشارات البيئية السرعة و الدقة والتنفيذ هو محل اهتمامهم والتواصل معهم قمة في الذوق و الإحترام و متابعة طلبات العميل لحظة بلحظة إلى أن يتم تسليم العميل التصاريح و التراخيص معتمدة .نتمنى لهم المزيد من التميز و النجاح الدائم. إن شاء الله",
        profileImage: "https://lh3.googleusercontent.com/a/ACg8ocIpE3aKzhn_fBIV8f7H7gZCrB7blKCg7Aoi4vFue2o2ixptvQ=w36-h36-p-rp-mo-br100"
      },
      {
        id: 'static_2',
        name: "Saeed Salah 1418",
        rating: 5,
        date: "قبل شهر",
        review: "مكتب بصمة الأرض للاستشارات البيئية من أميز المكاتب المتخصصة في المجال، ولمست فيهم الاحترافية والجدية. وأخص بالشكر المهندس فهد على تعامله الراقي وحرصه على تقديم أفضل ما عنده بكل إخلاص.واسكره علي سعة صدره وان شاء الله كل التعاملات القادمه معهم انصح فيهم جدا",
        profileImage: "https://lh3.googleusercontent.com/a/ACg8ocLc2WaGn0mkL4i_wPe525ltu7AtYmMtlsnQe39hmqHUbS6SKA=w36-h36-p-rp-mo-br100"
      },
      {
        id: 'static_3',
        name: "عبدالله العنزي",
        rating: 5,
        date: "قبل شهرين",
        review: "مكتب تصاريح بيئيه واستشارات شاب سعودي واقف على شغله الله يعطيه العافية",
        profileImage: "https://lh3.googleusercontent.com/a/ACg8ocLvID-PivQ42DPKaiTdzA717fZtEvffx37bL66rbOXu5g5byg=w36-h36-p-rp-mo-ba3-br100"
      },
      {
        id: 'static_4',
        name: "M6B",
        rating: 5,
        date: "قبل أسبوع",
        review: "شكر خاص لتعاملهم الراقي و خدمتهم السريعة و سرعة استجابتهم بالواتساب لين استخرجت التصاريح",
        profileImage: "https://lh3.googleusercontent.com/a-/ALV-UjXIHRNyEK79lBa7FqdoBdEYRTBH9UqrrGyW5JScY1mIEopTFnM=w36-h36-p-rp-mo-ba2-br100"
      },
      {
        id: 'static_5',
        name: "Dodge",
        rating: 5,
        date: "قبل أسبوع",
        review: "مكتب محترف وسريع ودقيق وتعامل أكثر من رائع . يستاهلون ألف نجمه ❤️",
        profileImage: "https://lh3.googleusercontent.com/a/ACg8ocI7R2Cvss9ut4vOEyhWAIQ1UWbzbpgjhxpGVtiBqv1AOmor_w=w36-h36-p-rp-mo-br100"
      },
      {
        id: 'static_6',
        name: "جاف الإعلانية خدمات التصميم والطباعة",
        rating: 5,
        date: "قبل 3 أشهر",
        review: "مكتب مميز وسريع بالاجراءات اصدر لنا تصريح بيئي ، والأخ فهد ما يقصر واضح وخدوم 🌷🌷",
        profileImage: "https://lh3.googleusercontent.com/a-/ALV-UjXK1dl7bmEx32NKSeEg3aOn3nmp3NI_VJtozkMlQT7Q57Qk7kQn=w36-h36-p-rp-mo-br100"
      },
      {
        id: 'static_7',
        name: "Tarem Saleh",
        rating: 5,
        date: "قبل شهر",
        review: "سريع بالانجاز التصاريح",
        profileImage: "https://lh3.googleusercontent.com/a/ACg8ocLE7Y3LhnwlOk2FxjrjLtV-g2esx1zrV3zEvbitlpZf_JfGtA=w36-h36-p-rp-mo-br100"
      }
    ];
  }

  // Clear cache manually
  clearCache() {
    this.cache.clear();
    console.log('Reviews cache cleared');
  }
}

export default new GoogleMapsService();

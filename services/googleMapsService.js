import puppeteer from 'puppeteer';
import axios from 'axios';

class GoogleMapsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes (shorter cache)
    this.reviewsUrl = 'https://www.google.com/maps/place/مكتب+بصمة+الارض+للاستشارات+البيئية%E2%80%AD/@26.3436164,43.974527,17z/data=!4m14!1m5!8m4!1e1!2s117083714203564495959!3m1!1e1!3m7!1s0x157f596476ef1083:0x1627f4ca3423d980!8m2!3d26.3442221!4d43.9737974!9m1!1b1!16s%2Fg%2F11x0qjbj_2?hl=ar&entry=ttu&g_ep=EgoyMDI1MTAxNC4wIKXMDSoASAFQAw%3D%3D';
    this.activeRequests = new Map(); // Track active requests to prevent duplicates
  }

  async getReviews() {
    try {
      // Check if we're in a serverless environment
      if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        console.log('Serverless environment detected, trying Google Maps API first...');
        
        // Try Google Maps API first in serverless
        try {
          const apiReviews = await this.getReviewsFromAPI();
          if (apiReviews && apiReviews.length > 0) {
            console.log(`✅ API reviews loaded: ${apiReviews.length} reviews`);
            return apiReviews;
          }
        } catch (error) {
          console.log('⚠️ API failed, using static reviews:', error.message);
        }
        
        // Fallback to static reviews
        console.log('Using static reviews as fallback');
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

  // Alternative method using axios for simpler scraping
  async getReviewsSimple() {
    try {
      const response = await axios.get(this.reviewsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000
      });

      // Parse HTML content (this is a simplified approach)
      // In a real implementation, you'd use cheerio or similar
      console.log('Fetched HTML content, length:', response.data.length);
      
      // For now, return the static reviews as fallback
      return this.getStaticReviews();
      
    } catch (error) {
      console.error('Simple scraping error:', error);
      return this.getStaticReviews();
    }
  }

  // Google Maps Places API method (works in serverless)
  async getReviewsFromAPI(forceRefresh = false) {
    const placeId = 'YOUR_PLACE_ID_HERE'; // Replace with your actual Place ID
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.log('⚠️ No Google Maps API key, using static reviews');
      return this.getStaticReviews();
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

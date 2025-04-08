// Listener for extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Updated URL check to include both hotel and checkout pages
  if (!tab.url || !tab.url.match(/agoda\.com\/(.*\/hotel\/|book\/)/)) {
    // Handle non-Agoda pages or invalid Agoda pages
    const isAgodaPage = tab.url.includes('agoda.com');
    const errorMessage = isAgodaPage 
      ? 'This extension only works on Agoda property pages or checkout pages.'
      : 'This extension only works on Agoda property pages or checkout pages. Please navigate to an Agoda page.';
    showError(tab.id, 'Invalid Page', errorMessage);
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: extractAgodaData
  }, (results) => {
    if (chrome.runtime.lastError) {
      showError(tab.id, 'Error', chrome.runtime.lastError.message);
      return;
    }
    
    const data = results[0].result;
    if (!data || data.error) {
      showError(tab.id, 'Data Error', data ? data.error : "Unknown error");
      return;
    }
    
    // Build the URL using the extracted data
    const newUrl = buildUrl(data);
    
    // Open the URL in an incognito window
    chrome.windows.create({
      url: newUrl,
      incognito: true
    });
  });
});

// This function runs in the context of the Agoda page to extract the needed attributes
function extractAgodaData() {
  try {
    // Check if we're on a checkout page first
    const checkoutHotelId = document.querySelector('input[name="hotel_id"]');
    const checkoutCheckIn = document.querySelector('input[name="travel_start_date"]');
    const checkoutCheckOut = document.querySelector('input[name="travel_end_date"]');

    if (checkoutHotelId && checkoutCheckIn && checkoutCheckOut) {
      const hotelId = checkoutHotelId.value;
      const checkInDate = checkoutCheckIn.value;
      const checkOutDate = checkoutCheckOut.value;

      // Extract guest info from checkout page - Fixed regex
      const guestInfoSpan = document.querySelector('[data-testid="room-info-guest-details"]');
      const roomCountSpan = document.querySelector('[data-section="cross-out-price"]');
      
      let adults = 1, children = 0, rooms = 1;
      
      if (guestInfoSpan) {
        const guestText = guestInfoSpan.textContent;
        console.log('Guest info text:', guestText); // Debug log
        
        // Updated regex patterns to handle both singular and plural forms
        const adultMatch = guestText.match(/(\d+)\s*adult(s)?/i);
        const childMatch = guestText.match(/,\s*(\d+)\s*child(ren)?/i);
        
        if (adultMatch) {
          adults = parseInt(adultMatch[1]);
          console.log('Found adults:', adults, 'Plural:', !!adultMatch[2]);
        }
        if (childMatch) {
          children = parseInt(childMatch[1]);
          console.log('Found children:', children, 'Plural:', !!childMatch[2]);
        }
        
        console.log('Parsed guest info:', { adults, children }); // Debug log
      }
      
      if (roomCountSpan) {
        const roomText = roomCountSpan.textContent;
        console.log('Room info text:', roomText); // Debug log
        
        // Updated regex to handle both singular and plural forms of "room"
        const roomMatch = roomText.match(/\((\d+)\s*room(s)?\s*x/i);
        if (roomMatch) {
          rooms = parseInt(roomMatch[1]);
          console.log('Found rooms:', rooms, 'Plural:', !!roomMatch[2]);
        }
      }

      // Extract country and currency from page script tags
      const pageScripts = document.getElementsByTagName('script');
      let country = '', currency = '';
      for (let script of pageScripts) {
        const countryMatch = script.textContent.match(/"countryOrigin"\s*:\s*"([^"]+)"/);
        const currencyMatch = script.textContent.match(/"currencyCode"\s*:\s*"([^"]+)"/);
        if (countryMatch) country = countryMatch[1];
        if (currencyMatch) currency = currencyMatch[1];
      }

      console.log('Checkout Page Data:', { hotelId, checkInDate, checkOutDate, adults, children, rooms, country, currency });
      return { hotelId, checkInDate, checkOutDate, adults, children, rooms, country, currency };
    }

    // Hotel page extraction
    const hotelElem = document.querySelector('[data-element-property-id]');
    const checkInElem = document.querySelector('[data-selenium="checkInBox"]');
    const checkOutElem = document.querySelector('[data-selenium="checkOutBox"]');
    // Updated selector to match exact element with all required attributes
    const occupancyBox = document.querySelector('[data-element-name="occupancy-box"][role="button"][aria-label*="Guests and rooms"]');
  
    if (!hotelElem || !checkInElem || !checkOutElem) {
      return { error: "Required elements not found. Please ensure you're on a valid Agoda hotel or checkout page." };
    }
    
    const hotelId = hotelElem.getAttribute("data-element-property-id");
    const checkInDate = checkInElem.getAttribute("data-date");
    const checkOutDate = checkOutElem.getAttribute("data-date");
    
    // Simplified occupancy info extraction using only aria-label
    let adults = 1, children = 0, rooms = 1;
    if (occupancyBox) {
      const ariaLabel = occupancyBox.getAttribute('aria-label');
      if (ariaLabel) {
        // First decode any HTML entities and clean up the string
        const decodedLabel = ariaLabel.replace(/&nbsp;/g, ' ').trim();
        console.log('Raw aria-label:', ariaLabel);
        console.log('Decoded aria-label:', decodedLabel);

        // Try pattern without children first
        let matches = decodedLabel.match(/(\d+)\s*adults?\s+(\d+)\s*room(?:s)?/i);
        
        if (matches) {
          // Case: No children
          adults = parseInt(matches[1], 10) || 1;
          rooms = parseInt(matches[2], 10) || 1;
          children = 0;
          console.log('Matched pattern without children:', { adults, rooms });
        } else {
          // Try pattern with children
          matches = decodedLabel.match(/(\d+)\s*adults?,\s*(\d+)\s*child(?:ren)?\s+(\d+)\s*room(?:s)?/i);
          if (matches) {
            // Case: Has children
            adults = parseInt(matches[1], 10) || 1;
            children = parseInt(matches[2], 10) || 0;
            rooms = parseInt(matches[3], 10) || 1;
            console.log('Matched pattern with children:', { adults, children, rooms });
          } else {
            console.log('No pattern matched, using defaults');
          }
        }

        // Force validation of extracted values
        adults = Math.max(1, adults);
        rooms = Math.max(1, rooms);
        children = Math.max(0, children);

        console.log('Final validated values:', {
          adults,
          children,
          rooms,
          originalText: decodedLabel
        });
      }
    }

    // Extract country and currency from page script tags
    const pageScripts = document.getElementsByTagName('script');
    let country = '', currency = '';
    for (let script of pageScripts) {
      const countryMatch = script.textContent.match(/"countryOrigin"\s*:\s*"([^"]+)"/);
      const currencyMatch = script.textContent.match(/"currencyCode"\s*:\s*"([^"]+)"/);
      if (countryMatch) country = countryMatch[1];
      if (currencyMatch) currency = currencyMatch[1];
    }
    
    console.log('Hotel Page Data:', { hotelId, checkInDate, checkOutDate, adults, children, rooms, country, currency });
    return { hotelId, checkInDate, checkOutDate, adults, children, rooms, country, currency };
  } catch (error) {
    return { error: error.message };
  }
}

// Helper function to construct the target URL
function buildUrl({ hotelId, checkInDate, checkOutDate, adults, children, rooms, country, currency }) {
  // Split dates in format YYYY-MM-DD
  const [inYear, inMonth, inDay] = checkInDate.split("-");
  const [outYear, outMonth, outDay] = checkOutDate.split("-");
  
  // Debug logging
  console.log('Building URL with params:', {
    adults, children, rooms, country, currency
  });

  // Ensure all parameters are strings and use default values if undefined
  const params = {
    site_id: "1917614",
    CkInDay: inDay,
    CkInMonth: inMonth,
    CkInYear: inYear,
    CkOutDay: outDay,
    CkOutMonth: outMonth,
    CkOutYear: outYear,
    selectedproperty: hotelId,
    NumberOfAdults: adults,
    NumberOfChildren: children,
    NumberOfRooms: rooms,
    UserCountry: country || '',
    Currency: currency || ''
  };

  // Debug logging
  console.log('Final URL params:', params);

  const queryString = Object.entries(params)
    .filter(([_, value]) => value !== '') // Remove empty values
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return `https://www.agoda.com/partners/partnersearch.aspx?${queryString}`;
}

// Function to show error with example
function showError(tabId, title, message) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    function: (title, message, examples) => {
      try {
        // Remove existing overlays
        const existingOverlay = document.getElementById('agoda-extension-error');
        if (existingOverlay) existingOverlay.remove();
        let expandedContainer = document.getElementById('expanded-image-container');
        if (expandedContainer) expandedContainer.remove();

        // Add styles if not present
        if (!document.getElementById('agoda-extension-styles')) {
          const style = document.createElement('style');
          style.id = 'agoda-extension-styles';
          style.textContent = `
            .agoda-extension-error-overlay {
              position: fixed;
              top: 20px;
              right: 20px;
              background: white;
              border: 2px solid red;
              padding: 20px;
              z-index: 2147483647;
              width: 400px;
              box-shadow: 0 0 10px rgba(0,0,0,0.5);
              font-family: Arial, sans-serif;
            }
            .agoda-extension-error-overlay * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            .agoda-extension-error-overlay h3 {
              color: red;
              margin: 0 0 10px 0;
            }
            .agoda-extension-error-overlay p {
              margin: 0 0 15px 0;
            }
            .agoda-extension-error-overlay img {
              width: 100%;
              border: 1px solid #ccc;
              margin-top: 10px;
              display: block;
              cursor: pointer;
              transition: opacity 0.2s;
            }
            .agoda-extension-error-overlay img:hover {
              opacity: 0.9;
            }
            .agoda-extension-error-overlay .example-caption {
              font-style: italic;
              margin: 10px 0 0 0;
              font-size: 0.9em;
            }
            .agoda-extension-error-overlay button {
              position: absolute;
              top: 10px;
              right: 10px;
              border: none;
              background: none;
              cursor: pointer;
              font-size: 16px;
              color: #666;
            }
            .agoda-extension-error-overlay button:hover {
              color: #000;
            }
            .agoda-extension-error-overlay .examples-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              margin-top: 10px;
            }
            .agoda-extension-error-overlay .example-container {
              text-align: center;
            }
            #expanded-image-container {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.9);
              z-index: 2147483648;
              display: none;
              justify-content: center;
              align-items: center;
              padding: 40px;
            }
            #expanded-image-container.active {
              display: flex;
            }
            #expanded-image {
              max-width: 90%;
              max-height: 90vh;
              object-fit: contain;
              border: 2px solid white;
              box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
            }
          `;
          document.head.appendChild(style);
        }

        // Create expanded image container
        expandedContainer = document.createElement('div');
        expandedContainer.id = 'expanded-image-container';
        const expandedImage = document.createElement('img');
        expandedImage.id = 'expanded-image';
        expandedContainer.appendChild(expandedImage);
        document.body.appendChild(expandedContainer);

        // Create error overlay
        const overlay = document.createElement('div');
        overlay.id = 'agoda-extension-error';
        overlay.classList.add('agoda-extension-error-overlay');
        
        overlay.innerHTML = `
          <h3>${title}</h3>
          <p>${message}</p>
          <div class="examples-grid">
            <div class="example-container">
              <img src="${examples.hotel}" alt="Example of hotel property page" class="example-image">
              <p class="example-caption">Example: Hotel property page (click to enlarge)</p>
            </div>
            <div class="example-container">
              <img src="${examples.checkout}" alt="Example of checkout page" class="example-image">
              <p class="example-caption">Example: Checkout page (click to enlarge)</p>
            </div>
          </div>
          <button class="close-button">✕</button>
        `;
        document.body.appendChild(overlay);

        // Add event listeners
        const closeButton = overlay.querySelector('.close-button');
        closeButton.addEventListener('click', () => overlay.remove());

        expandedContainer.addEventListener('click', () => {
          expandedContainer.classList.remove('active');
        });

        expandedImage.addEventListener('click', (e) => {
          e.stopPropagation();
        });

        const exampleImages = overlay.querySelectorAll('.example-image');
        exampleImages.forEach(img => {
          img.addEventListener('click', () => {
            expandedImage.src = img.src;
            expandedContainer.classList.add('active');
          });
        });

      } catch (error) {
        console.error('Failed to show error overlay:', error);
      }
    },
    args: [
      title, 
      message, 
      {
        hotel: chrome.runtime.getURL('Example.png'),
        checkout: chrome.runtime.getURL('Example2.png')
      }
    ]
  }).catch(error => {
    console.error('Failed to execute script:', error);
  });
}

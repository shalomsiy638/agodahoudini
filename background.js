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

    // If checkout page elements exist, use those
    if (checkoutHotelId && checkoutCheckIn && checkoutCheckOut) {
      const hotelId = checkoutHotelId.value;
      const checkInDate = checkoutCheckIn.value;
      const checkOutDate = checkoutCheckOut.value;

      if (!hotelId || !checkInDate.match(/^\d{4}-\d{2}-\d{2}$/) || !checkOutDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return { error: "Invalid data format found on the checkout page." };
      }

      return { hotelId, checkInDate, checkOutDate };
    }

    // Fall back to hotel page selectors
    const hotelElem = document.querySelector('[data-element-property-id]');
    const checkInElem = document.querySelector('[data-selenium="checkInBox"]');
    const checkOutElem = document.querySelector('[data-selenium="checkOutBox"]');
  
    if (!hotelElem || !checkInElem || !checkOutElem) {
      return { error: "Required elements not found. Please ensure you're on a valid Agoda hotel or checkout page." };
    }
    
    const hotelId = hotelElem.getAttribute("data-element-property-id");
    const checkInDate = checkInElem.getAttribute("data-date");
    const checkOutDate = checkOutElem.getAttribute("data-date");
    
    if (!hotelId || !checkInDate.match(/^\d{4}-\d{2}-\d{2}$/) || !checkOutDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return { error: "Invalid data format found on the hotel page." };
    }
    
    return { hotelId, checkInDate, checkOutDate };
  } catch (error) {
    return { error: error.message };
  }
}

// Helper function to construct the target URL
function buildUrl({ hotelId, checkInDate, checkOutDate }) {
  // Split dates in format YYYY-MM-DD
  const [inYear, inMonth, inDay] = checkInDate.split("-");
  const [outYear, outMonth, outDay] = checkOutDate.split("-");
  
  const baseUrl = "https://www.agoda.com/partners/partnersearch.aspx";
  const params = new URLSearchParams({
    site_id: "1917614",
    CkInDay: inDay,
    CkInMonth: inMonth,
    CkInYear: inYear,
    CkOutDay: outDay,
    CkOutMonth: outMonth,
    CkOutYear: outYear,
    selectedproperty: hotelId
  });
  
  return `${baseUrl}?${params.toString()}`;
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

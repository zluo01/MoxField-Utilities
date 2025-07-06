// ==UserScript==
// @name        MoxField EDHREC Combo Display
// @namespace   Violentmonkey Scripts
// @match       https://moxfield.com/decks/*
// @grant       none
// @version     1.0
// @author      zluo01
// @description 7/5/2025, 4:16:14 PM
// ==/UserScript==

(function () {
    'use strict';

    // simple in-memory volatile cache to cache combo data
    class TTLCache {
        constructor(ttlHours = 1) {
            this.ttl = ttlHours * 60 * 60 * 1000; // Convert hours to milliseconds
            this.cache = new Map();
        }

        get(key) {
            const item = this.cache.get(key);
            if (!item) return null;

            // Check if item has expired
            if (Date.now() - item.timestamp > this.ttl) {
                this.cache.delete(key);
                return null;
            }
            return item.value;
        }

        set(key, value) {
            this.cache.set(key, {
                value: value,
                timestamp: Date.now()
            });
        }
    }

    let cache = new TTLCache();

    // Function to extract data-hash from image src URL
    function extractDataHashFromImageSrc(src) {
        // Extract hash from URL like: https://assets.moxfield.net/cards/card-k7lVb-normal.webp?204767761
        const match = src.match(/\/card-([^-]+)-/);
        return match ? match[1] : null;
    }

    // Function to get data-hash from deckview image
    function getCurrentDisplayCardName() {
        const imgElement = document.querySelector('img.deckview-image.img-card');
        if (imgElement && imgElement.src) {
            const dataHash = extractDataHashFromImageSrc(imgElement.src)
            if (dataHash) {
                return findCardNameByHash(dataHash);
            }
        }
        return null;
    }

    // Function to find card name by data-hash value
    function findCardNameByHash(hash) {
        // Find element with matching data-hash attribute
        const element = document.querySelector(`[data-hash="${hash}"]`);
        if (element) {
            let cardName = '';

            // Method 1: Look for div with class 'decklist-card-phantomsearch' within the element
            const phantomDiv = element.querySelector('.decklist-card-phantomsearch');
            if (phantomDiv) {
                cardName = phantomDiv.textContent?.trim() || '';
            }

            // Method 2: Look for anchor with class 'table-deck-row-link' within the element
            if (!cardName) {
                const deckLink = element.querySelector('a.table-deck-row-link');
                if (deckLink) {
                    cardName = deckLink.textContent?.trim() || '';
                }
            }

            return cardName || null;
        }
        return null;
    }

    // Function to format card name into dash-connected lowercase string
    function formatCardName(cardName) {
        return cardName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim()
            .replace(/\s+/g, '-');
    }

    async function fetchComboData(cardName) {
        // Check cache first
        const cachedData = cache.get(cardName);
        if (cachedData) {
            return cachedData;
        }

        // Fetch from API if not in cache
        try {
            const formattedName = formatCardName(cardName);
            const url = `https://json.edhrec.com/pages/combos/${formattedName}.json`;
            console.log('Fetching combo data from:', url);

            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 403) { // no combo exists
                    cache.set(cardName, null);
                } else {
                    console.error('API request failed:', response.status, response.statusText);
                }
                return null;
            }

            const data = await response.json();

            // Extract header and cardlists
            const combos = data.container?.json_dict?.cardlists || [];

            // Filter cardlists to only include combos where cardviews contains the formatted card name
            const filteredCombos = combos.filter(combo => {
                return combo.cardviews && combo.cardviews.some(cardview =>
                    cardview.sanitized === formattedName
                ) || combo.header.includes(cardName);
            }).map(combo => ({
                header: combo.header,
                href: combo.href,
                results: combo.combo?.results || []
            }));

            let result = null;
            if (filteredCombos.length > 0) {
                result = filteredCombos;
            }

            // Cache the result
            cache.set(cardName, result);
            return result;
        } catch (error) {
            console.error('Error fetching combo data:', error);
            return null;
        }
    }

    // Function to display combo results in the UI
    function displayComboResults(cardName, comboData) {
        // Remove existing combo display if it exists
        const existingDisplay = document.getElementById('moxfield-combo-display');
        if (existingDisplay) {
            existingDisplay.remove();
        }

        if (!comboData) {
            return;
        }

        // Find the aside element to append after
        const asideElement = document.querySelector('aside.deckview-image-container.is-owner');
        if (!asideElement) {
            return;
        }

        // Create combo display container
        const comboDisplay = document.createElement('div');
        comboDisplay.id = 'moxfield-combo-display';
        comboDisplay.style.cssText = `
            max-width: 230px;
            width: 100%;
            background: inherit;
            margin-inline: auto;
            margin-top: 1rem;
        `;

        // Create header
        const headerElement = document.createElement('span');
        headerElement.textContent = `Combo For ${cardName} (${comboData.length})`;
        headerElement.style.cssText = `
            margin: 0 0 0.75rem 0;
            font-size: 1rem;
            font-weight: 600;
            line-height: 1.5;
        `;
        comboDisplay.appendChild(headerElement);

        // Create combo list
        comboDisplay.appendChild(headerElement);

        const comboSection = document.createElement('div')
        comboSection.classList.add('d-grid')
        comboSection.style.cssText = `
            max-height: 24rem;
            width: 100%;
            max-width: 100%;
            overflow-y: auto;
            margin-inline: auto;
            margin-top: 0.5rem;
            gap: 0.5rem;
        `;

        // Create combo list
        comboData.forEach((combo, index) => {
            // Combo container
            const comboContainer = document.createElement('a');
            comboContainer.href = `https://edhrec.com${combo.href}`;
            comboContainer.target = '_blank';
            comboContainer.classList.add('border-primary')
            comboContainer.style.cssText = `
                border-radius: 0.375rem;
                transition: all 0.15s ease-in-out;
                text-decoration: none;
                width: 100%;
                border-style: solid;
                border-width: 1px;
                padding: 0.5rem;
            `;

            // Clickable combo header
            const comboHeader = document.createElement('span');
            comboHeader.classList.add('text-primary')
            comboHeader.textContent = combo.header;
            comboHeader.style.cssText = `
                display: block;
                text-decoration: none;
                font-weight: 500;
                font-size: 0.875rem;
                line-height: 1.25rem;
                margin-bottom: 0.5rem;
                cursor: pointer;
                transition: color 0.15s ease-in-out;
            `;

            // Results list
            const resultsList = document.createElement('ul');
            resultsList.classList.add('text-secondary')
            resultsList.style.cssText = `
                margin: 0;
                padding-left: 1.25rem;
                font-size: 0.8125rem;
                line-height: 1.25rem;
                list-style-type: disc;
            `;

            combo.results.forEach(result => {
                const resultItem = document.createElement('li');
                resultItem.textContent = result;
                resultItem.style.cssText = `
                    margin-bottom: 0.25rem;
                    line-height: 1.375;
                `;
                resultsList.appendChild(resultItem);
            });

            comboContainer.appendChild(comboHeader);
            comboContainer.appendChild(resultsList);
            comboSection.appendChild(comboContainer);
        });

        comboDisplay.appendChild(comboSection)
        asideElement.appendChild(comboDisplay);
    }

    async function fetchCombo() {
        const name = getCurrentDisplayCardName();
        if (name) {
            const combo = await fetchComboData(name);
            displayComboResults(name, combo)
        }
    }

    function setupAsideObserver() {
        // Disconnect existing observer if it exists
        if (window.asideObserver) {
            window.asideObserver.disconnect();
        }

        const wrapperElement = document.querySelector('div.deckview-image-wrapper');
        if (wrapperElement) {
            const asideObserver = new MutationObserver((mutations) => {
                clearTimeout(window.asideExtractTimeout);
                window.asideExtractTimeout = setTimeout(() => {
                    fetchCombo();
                }, 100);
            });

            asideObserver.observe(wrapperElement, {
                childList: true,       // Watch for added/removed children
                subtree: true,         // Watch entire subtree
                attributes: true,      // Watch for attribute changes
                characterData: true    // Watch for text content changes
            });

            // Store the observer so we can disconnect it if needed
            window.asideObserver = asideObserver;
        } else {
            console.log('div.deckview-image-wrapper not found, will retry...');
            // Retry after a short delay in case the element loads later
            setTimeout(setupAsideObserver, 1000);
        }
    }

    // Wait for page to load and then run
    function init() {
        // Wait a bit for dynamic content to load
        setTimeout(() => {
            fetchCombo();
            setupAsideObserver();
        }, 2000); // Wait 2 seconds for initial page load
    }


    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
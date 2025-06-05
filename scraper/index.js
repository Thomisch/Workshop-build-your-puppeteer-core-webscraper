const puppeteer = require('puppeteer-core');

async function initScraper() {
  try {
    // Obtenir l'URL WebSocket depuis l'API de debug
    const response = await fetch('http://localhost:9222/json');
    const targets = await response.json();
    const websocketUrl = targets[0].webSocketDebuggerUrl;
    
    // Se connecter au navigateur Edge existant
    const browser = await puppeteer.connect({
      browserWSEndpoint: "ws://localhost:9222/devtools/browser/8741bbe6-f130-4001-81f2-c8d71af241dc",
      defaultViewport: null
    });
    
    console.log('Connecté au navigateur Edge');
    
    // Créer une nouvelle page ou utiliser une existante
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    return { browser, page };
  } catch (error) {
    console.error('Erreur de connexion:', error);
  }
}

async function scrapeWallapopCars(page) {
  console.log('Début du scraping des annonces SEAT Ibiza...');
  
  // Attendre que les cartes se chargent
  try {
    await page.waitForSelector('.item-card_ItemCard--vertical__FiFz6', { timeout: 10000 });
    console.log('✅ Cartes d\'annonces trouvées');
  } catch (error) {
    console.log('⚠️ Timeout sur le sélecteur principal, essai avec extraction directe...');
  }
  
  const cars = await page.evaluate(() => {
    // Sélecteur basé sur l'HTML fourni
    const carCards = document.querySelectorAll('.item-card_ItemCard--vertical__FiFz6');
    const results = [];
    
    console.log(`Traitement de ${carCards.length} annonces...`);
    
    carCards.forEach((card, index) => {
      try {
        // URL de l'annonce
        const url = card.getAttribute('href');
        const fullUrl = url.startsWith('http') ? url : 'https://es.wallapop.com' + url;
        
        // ID depuis l'URL
        const idMatch = url.match(/(\d+)$/);
        const id = idMatch ? idMatch[1] : `unknown_${index}`;
        
        // Prix
        const priceElement = card.querySelector('.item-card_ItemCard__price__D3QWU');
        const price = priceElement ? priceElement.textContent.trim() : 'Prix non trouvé';
        
        // Titre
        const titleElement = card.querySelector('.item-card_ItemCard__title__8eq2b');
        const title = titleElement ? titleElement.textContent.trim() : 'Titre non trouvé';
        
        // Attributs (année, carburant, CV, km)
        const attributesElement = card.querySelector('.item-card_ItemCard__attributes__YhG0G');
        const attributesText = attributesElement ? attributesElement.textContent.trim() : '';
        
        // Parser les attributs
        let year = 'Non spécifié';
        let fuel = 'Non spécifié';
        let cv = 'Non spécifié';
        let km = 'Non spécifié';
        
        if (attributesText) {
          const parts = attributesText.split(' · ');
          if (parts.length >= 1) year = parts[0];
          if (parts.length >= 2) fuel = parts[1];
          if (parts.length >= 3) cv = parts[2];
          if (parts.length >= 4) km = parts[3];
        }
        
        // Image
        const imageElement = card.querySelector('img');
        const imageUrl = imageElement ? imageElement.getAttribute('src') : 'Pas d\'image';
        
        results.push({
          id,
          title,
          price,
          year,
          fuel,
          cv,
          km,
          url: fullUrl,
          imageUrl,
          attributes: attributesText,
          scrapedAt: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`Erreur lors du scraping de l'annonce ${index}:`, error);
      }
    });
    
    return results;
  });
  
  return cars;
}

async function scrapeWallapop() {
  const { browser, page } = await initScraper();
  
  // Naviguer vers Wallapop SEAT Ibiza
  await page.goto('https://es.wallapop.com/search?source=search_box&keywords=seat+ibiza');
  
  console.log('Page Wallapop chargée, début du scraping...');
  
  try {
    // Attendre que la page se charge
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Scraper les annonces de voitures
    const cars = await scrapeWallapopCars(page);
    
    console.log(`\n=== RÉSULTATS: ${cars.length} SEAT Ibiza trouvées ===`);
    
    cars.forEach((car, index) => {
      console.log(`\n--- Annonce ${index + 1} ---`);
      console.log(`ID: ${car.id}`);
      console.log(`Titre: ${car.title}`);
      console.log(`Prix: ${car.price}`);
      console.log(`Année: ${car.year}`);
      console.log(`Carburant: ${car.fuel}`);
      console.log(`Puissance: ${car.cv}`);
      console.log(`Kilométrage: ${car.km}`);
      console.log(`URL: ${car.url}`);
      console.log(`Attributs complets: ${car.attributes}`);
    });
    
    // Sauvegarder les données
    const fs = require('fs');
    fs.writeFileSync('seat_ibiza_wallapop.json', JSON.stringify(cars, null, 2));
    console.log('\n✅ Données sauvegardées dans seat_ibiza_wallapop.json');
    
    // Statistiques rapides
    const prices = cars.filter(car => car.price !== 'Prix non trouvé')
                      .map(car => parseInt(car.price.replace(/[^\d]/g, '')))
                      .filter(price => !isNaN(price));
    
    if (prices.length > 0) {
      const avgPrice = Math.round(prices.reduce((a, b) => a + b) / prices.length);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      console.log(`\n=== STATISTIQUES ===`);
      console.log(`Prix moyen: ${avgPrice}€`);
      console.log(`Prix minimum: ${minPrice}€`);
      console.log(`Prix maximum: ${maxPrice}€`);
    }
    
  } catch (error) {
    console.error('Erreur lors du scraping:', error);
  }
}

scrapeWallapop();
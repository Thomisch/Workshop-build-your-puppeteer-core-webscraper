je m'appète à scraper airbnb pour constituer mon séjour à bayonne. Commence par m'expliquer étape par étape comment initialiser mon scraper en node avec puppetteer-core, ensuite il se connectera à mon web browser edge en remote debugging à l'aide du websocket url

Je vais vous guider étape par étape pour créer un scraper Airbnb avec Node.js et Puppeteer-core qui se connecte à votre navigateur Edge.

## Étapes d'initialisation

### 1. Initialiser le projet Node.js

```bash
npm init -y
npm install puppeteer-core
```

### 2. Configurer Edge pour le remote debugging

Fermez complètement Edge, puis relancez-le avec le debug activé :

```bash
/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge --remote-debugging-port=9222 --user-data-dir=/tmp/edge-debug
```

### 3. Récupérer l'URL WebSocket

Ouvrez http://localhost:9222/json dans un nouvel onglet pour obtenir l'URL WebSocket.

### 4. Créer le scraper de base

````javascript
const puppeteer = require('puppeteer-core');

async function initScraper() {
  try {
    // Obtenir l'URL WebSocket depuis l'API de debug
    const response = await fetch('http://localhost:9222/json');
    const targets = await response.json();
    const websocketUrl = targets[0].webSocketDebuggerUrl;
    
    // Se connecter au navigateur Edge existant
    const browser = await puppeteer.connect({
      browserWSEndpoint: websocketUrl,
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

async function scrapeAirbnb() {
  const { browser, page } = await initScraper();
  
  // Naviguer vers Airbnb Bayonne
  await page.goto('https://www.airbnb.fr/s/Bayonne--France/homes');
  
  console.log('Page Airbnb chargée, prêt pour le scraping');
  
  // Votre logique de scraping ici
  
  // Ne pas fermer le navigateur pour garder Edge ouvert
  // await browser.disconnect();
}

scrapeAirbnb();
````

### 5. Prochaines étapes

Une fois connecté, vous pourrez :
- Naviguer sur Airbnb
- Extraire les données des annonces
- Gérer la pagination
- Sauvegarder les résultats

---

bon on va changer le boss, on va aller chercher des seat ibiza sur wallapop finalement c'est trop embètant airbnb à scraper. Bon maintenant on va scraper cette page: https://es.wallapop.com/search?source=search_box&keywords=seat+ibiza
et voici l'outerHtml d'une annonce d'auto dans laquelle je veux récupérer le prix, le titre, the year, km, carburant, cv: <a href="/item/seat-ibiza-1999-1139483602" aria-label="SEAT Ibiza 1999" title="SEAT Ibiza 1999" class="item-card_ItemCard--vertical__FiFz6 d-flex undefined position-relative" target="_blank"><div class="item-card_ItemCard__image__2mxIn item-card_ItemCard__image--vertical__2eHJw"><img src="https://cdn.wallapop.com/images/10420/iu/f3/__/c10420p1139483602/i5702689897.jpg?pictureSize=W640" alt="SEAT Ibiza 1999" class="item-card_ItemCard__image--single__OejGA w-100 card-common_Card--M__yP9A6" loading="lazy" style="opacity: 1; transition: opacity ease-in-out;"></div><div class="item-card_ItemCard__content__jIs_j d-flex flex-column flex-grow-1"><div class="d-flex justify-content-between align-items-center mt-1"><div><strong aria-label="Item price" class="item-card_ItemCard__price__D3QWU">1000&nbsp;€</strong></div><button aria-label="add to favourites" aria-pressed="false" class="favorite-icon_FavoriteIcon___sE0A"><walla-icon icon="favourite_empty" class="hydrated"></walla-icon></button></div><h3 class="item-card_ItemCard__title__8eq2b mt-1 mb-0">SEAT Ibiza 1999</h3><label class="item-card_ItemCard__attributes__YhG0G mt-1 mb-0">1999 · Diésel · 68 cv</label></div></a>

---

Parfait ! Changeons de cap vers Wallapop pour scraper des SEAT Ibiza. Voici le code adapté pour cette nouvelle cible :

````javascript
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
````

Ce scraper pour Wallapop :

1. **Cible le bon sélecteur** : `.item-card_ItemCard--vertical__FiFz6`
2. **Extrait toutes les données** : prix, titre, année, carburant, CV, kilométrage
3. **Parse les attributs** depuis le texte "1999 · Diésel · 68 cv"
4. **Récupère l'image** et l'URL de chaque annonce
5. **Calcule des statistiques** de prix
6. **Sauvegarde** dans un fichier JSON dédié

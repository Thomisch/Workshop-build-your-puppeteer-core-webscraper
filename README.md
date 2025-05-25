# Workshop: Introduction au Web Scraping Industriel

## Vue d'ensemble

Ce workshop vous guidera à travers la création d'un environnement de web scraping industriel en utilisant Microsoft Edge en mode remote debugging et Puppeteer-Core. Nous utiliserons leboncoin.fr comme cas d'étude pratique.

## Table des matières

1. Use-case Business & Data Strategy
2. Infrastructure de Proxy et Anonymisation
3. Environnement de Développement
4. Identification des Sélecteurs
5. Implémentation avec Puppeteer-Core
6. Transfert et Transformation des Données

---

## 1. Use-case Business & Data Strategy

### Contexte métier : Analyse du marché immobilier

**Objectif** : Créer un dataset d'annonces immobilières pour :
- Analyser les tendances de prix par zone géographique
- Détecter les opportunités d'investissement
- Créer un modèle prédictif de prix immobilier
- Monitorer l'évolution du marché en temps réel

**Données cibles** :
- Prix, superficie, localisation
- Caractéristiques du bien (chambres, étage, etc.)
- Photos et descriptions
- Données temporelles (date de publication, mise à jour)

**ROI attendu** :
- Gain de temps : automatisation vs recherche manuelle
- Précision : données structurées vs analyse subjective
- Scalabilité : monitoring de milliers d'annonces simultanément

---

## 2. Infrastructure de Proxy et Anonymisation

### Types de solutions proxy

#### **Proxies résidentiels**
- **Avantages** : IP "réelles", difficiles à détecter
- **Fournisseurs** : Bright Data, Oxylabs, Smartproxy
- **Coût** : 15-50€/GB
- **Use case** : Sites avec anti-bot sophistiqué

#### **Proxies datacenter**
- **Avantages** : Rapides, moins chers
- **Fournisseurs** : ProxyMesh, Storm Proxies
- **Coût** : 5-20€/mois
- **Use case** : Sites avec protection basique

#### **Proxy rotatifs**
- **Avantages** : Rotation automatique des IP
- **Recommandation** : Essentiel pour le scraping à grande échelle

### Stratégie de contournement

1. **User-Agent rotation**
2. **Délais aléatoires entre requêtes**
3. **Utilisation du profil utilisateur existant**
4. **Headers HTTP réalistes**

---

## 3. Environnement de Développement

### Étape 1 : Lancement d'Edge en mode remote debugging

````bash
# Créer un dossier pour le profil de débogage
mkdir ~/edge-debug-profile

# Lancer Edge en mode remote debugging (macOS)
/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge \
  --remote-debugging-port=9222 \
  --user-data-dir=~/edge-debug-profile \
  --disable-web-security \
  --disable-features=VizDisplayCompositor
````

### Étape 2 : Initialisation du projet Node.js

````bash
# Créer le projet
mkdir leboncoin-scraper
cd leboncoin-scraper
npm init -y

# Installer les dépendances
npm install puppeteer-core csv-writer dotenv
npm install --save-dev nodemon
````

### Étape 3 : Configuration de base

````javascript
require('dotenv').config();

module.exports = {
  browser: {
    debuggingPort: 9222,
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  },
  scraping: {
    baseUrl: 'https://www.leboncoin.fr',
    delays: {
      min: 1000,
      max: 3000
    }
  },
  output: {
    csvPath: './data/annonces.csv'
  }
};
````

### Étape 4 : Connexion au navigateur

````javascript
const puppeteer = require('puppeteer-core');
const config = require('../config/config');

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async connect() {
    try {
      this.browser = await puppeteer.connect({
        browserURL: `http://localhost:${config.browser.debuggingPort}`,
        defaultViewport: config.browser.defaultViewport
      });
      
      console.log('✅ Connexion au navigateur réussie');
      return this.browser;
    } catch (error) {
      console.error('❌ Erreur de connexion:', error.message);
      throw error;
    }
  }

  async createPage() {
    if (!this.browser) {
      await this.connect();
    }
    
    this.page = await this.browser.newPage();
    
    // Configuration du User-Agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    );
    
    return this.page;
  }

  async close() {
    if (this.page) await this.page.close();
    // Note: ne pas fermer le navigateur car il est en mode debug
  }
}

module.exports = BrowserManager;
````

---

## 4. Identification des Sélecteurs

### Méthodologie d'analyse

1. **Inspection manuelle** : F12 → Elements
2. **Test des sélecteurs** : Console → `document.querySelector()`
3. **Validation de robustesse** : Tester sur plusieurs pages

### Sélecteurs pour leboncoin.fr

````javascript
const selectors = {
  // Page de recherche
  searchResults: '[data-test-id="ad-search-result"]',
  adLink: '[data-test-id="ad-link"]',
  
  // Page d'annonce
  title: '[data-test-id="ad-title"]',
  price: '[data-test-id="ad-price"]',
  location: '[data-test-id="ad-location"]',
  description: '[data-test-id="ad-description"]',
  characteristics: '[data-test-id="criteria"] [data-test-id="criterion"]',
  images: '[data-test-id="slider-image"] img',
  
  // Navigation
  nextPage: '[data-test-id="next-page"]',
  
  // Anti-bot
  captcha: '.captcha-container',
  blocked: '.blocked-message'
};

module.exports = selectors;
````

---

## 5. Implémentation avec Puppeteer-Core

### Étape 1 : Gestionnaire d'URLs

````javascript
class UrlGenerator {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  generateSearchUrls(params) {
    const { category, locations, priceRange, pages } = params;
    const urls = [];

    locations.forEach(location => {
      for (let page = 1; page <= pages; page++) {
        const url = new URL('/recherche', this.baseUrl);
        url.searchParams.set('category', category);
        url.searchParams.set('locations', location);
        url.searchParams.set('price', `${priceRange.min}-${priceRange.max}`);
        url.searchParams.set('page', page);
        
        urls.push({
          url: url.toString(),
          location,
          page
        });
      }
    });

    return urls;
  }
}

module.exports = UrlGenerator;
````

### Étape 2 : Extracteur de données

````javascript
const selectors = require('./selectors');

class DataExtractor {
  constructor(page) {
    this.page = page;
  }

  async extractSearchResults() {
    return await this.page.evaluate((selectors) => {
      const ads = Array.from(document.querySelectorAll(selectors.searchResults));
      
      return ads.map(ad => {
        const linkElement = ad.querySelector(selectors.adLink);
        return {
          url: linkElement ? linkElement.href : null,
          title: ad.querySelector('[data-test-id="ad-title"]')?.textContent?.trim(),
          price: ad.querySelector('[data-test-id="ad-price"]')?.textContent?.trim(),
          location: ad.querySelector('[data-test-id="ad-location"]')?.textContent?.trim()
        };
      }).filter(ad => ad.url);
    }, selectors);
  }

  async extractAdDetails() {
    return await this.page.evaluate((selectors) => {
      const getTextContent = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
      };

      const characteristics = {};
      document.querySelectorAll(selectors.characteristics).forEach(item => {
        const label = item.querySelector('[data-test-id="criterion-label"]')?.textContent?.trim();
        const value = item.querySelector('[data-test-id="criterion-value"]')?.textContent?.trim();
        if (label && value) {
          characteristics[label] = value;
        }
      });

      const images = Array.from(document.querySelectorAll(selectors.images))
        .map(img => img.src)
        .filter(src => src && !src.includes('placeholder'));

      return {
        title: getTextContent(selectors.title),
        price: getTextContent(selectors.price),
        location: getTextContent(selectors.location),
        description: getTextContent(selectors.description),
        characteristics,
        images,
        scrapedAt: new Date().toISOString(),
        url: window.location.href
      };
    }, selectors);
  }
}

module.exports = DataExtractor;
````

### Étape 3 : Scraper principal

````javascript
const BrowserManager = require('./browser-manager');
const DataExtractor = require('./data-extractor');
const UrlGenerator = require('./url-generator');
const CsvWriter = require('./csv-writer');
const config = require('../config/config');

class LeboncoinScraper {
  constructor() {
    this.browserManager = new BrowserManager();
    this.csvWriter = new CsvWriter();
    this.results = [];
  }

  async scrape(searchParams) {
    const page = await this.browserManager.createPage();
    const extractor = new DataExtractor(page);
    const urlGenerator = new UrlGenerator(config.scraping.baseUrl);
    
    const urls = urlGenerator.generateSearchUrls(searchParams);
    console.log(`🚀 Démarrage du scraping de ${urls.length} pages`);

    for (const [index, urlData] of urls.entries()) {
      try {
        console.log(`📄 Page ${index + 1}/${urls.length}: ${urlData.location} - Page ${urlData.page}`);
        
        await page.goto(urlData.url, { waitUntil: 'networkidle2' });
        await this.randomDelay();

        // Vérifier les blocages
        if (await this.checkForBlocking(page)) {
          console.log('🚫 Blocage détecté, arrêt du scraping');
          break;
        }

        // Extraire les liens d'annonces
        const searchResults = await extractor.extractSearchResults();
        console.log(`📋 ${searchResults.length} annonces trouvées`);

        // Scraper chaque annonce
        for (const ad of searchResults) {
          try {
            await page.goto(ad.url, { waitUntil: 'networkidle2' });
            await this.randomDelay();

            const details = await extractor.extractAdDetails();
            this.results.push({
              ...ad,
              ...details,
              searchLocation: urlData.location,
              searchPage: urlData.page
            });

          } catch (error) {
            console.error(`❌ Erreur annonce ${ad.url}:`, error.message);
          }
        }

        // Sauvegarde intermédiaire tous les 50 résultats
        if (this.results.length > 0 && this.results.length % 50 === 0) {
          await this.csvWriter.write(this.results);
          console.log(`💾 Sauvegarde intermédiaire: ${this.results.length} annonces`);
        }

      } catch (error) {
        console.error(`❌ Erreur page ${urlData.url}:`, error.message);
      }
    }

    // Sauvegarde finale
    await this.csvWriter.write(this.results);
    console.log(`✅ Scraping terminé: ${this.results.length} annonces extraites`);

    await this.browserManager.close();
    return this.results;
  }

  async randomDelay() {
    const delay = Math.random() * 
      (config.scraping.delays.max - config.scraping.delays.min) + 
      config.scraping.delays.min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async checkForBlocking(page) {
    const captcha = await page.$('.captcha-container');
    const blocked = await page.$('.blocked-message');
    return captcha || blocked;
  }
}

module.exports = LeboncoinScraper;
````

---

## 6. Transfert et Transformation des Données

### Étape 1 : Export CSV

````javascript
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const config = require('../config/config');

class CsvWriter {
  constructor() {
    this.csvWriter = createCsvWriter({
      path: config.output.csvPath,
      header: [
        { id: 'title', title: 'Titre' },
        { id: 'price', title: 'Prix' },
        { id: 'location', title: 'Localisation' },
        { id: 'description', title: 'Description' },
        { id: 'surface', title: 'Surface' },
        { id: 'rooms', title: 'Pièces' },
        { id: 'url', title: 'URL' },
        { id: 'scrapedAt', title: 'Date de scraping' }
      ]
    });
  }

  async write(data) {
    const processedData = data.map(item => ({
      ...item,
      surface: item.characteristics?.['Surface'] || '',
      rooms: item.characteristics?.['Pièces'] || ''
    }));

    await this.csvWriter.writeRecords(processedData);
  }
}

module.exports = CsvWriter;
````

### Étape 2 : Script de lancement

````javascript
const LeboncoinScraper = require('./src/scraper');

async function main() {
  const scraper = new LeboncoinScraper();
  
  const searchParams = {
    category: 'immobilier',
    locations: ['paris', 'lyon', 'marseille'],
    priceRange: { min: 100000, max: 500000 },
    pages: 5
  };

  try {
    await scraper.scrape(searchParams);
  } catch (error) {
    console.error('❌ Erreur globale:', error);
  }
}

main();
````

### Étape 3 : Transformation pour base de données

````sql
CREATE TABLE annonces_immobilier (
    id SERIAL PRIMARY KEY,
    titre VARCHAR(255),
    prix DECIMAL(10,2),
    localisation VARCHAR(100),
    surface INTEGER,
    pieces INTEGER,
    description TEXT,
    url VARCHAR(500),
    date_scraping TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour les recherches fréquentes
CREATE INDEX idx_prix ON annonces_immobilier(prix);
CREATE INDEX idx_localisation ON annonces_immobilier(localisation);
CREATE INDEX idx_surface ON annonces_immobilier(surface);
````

### Étape 4 : API REST pour exploitation

````javascript
const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({
  // Configuration PostgreSQL
});

// Endpoint pour rechercher des annonces
app.get('/api/annonces', async (req, res) => {
  const { localisation, prix_min, prix_max, surface_min } = req.query;
  
  let query = 'SELECT * FROM annonces_immobilier WHERE 1=1';
  const params = [];
  
  if (localisation) {
    query += ' AND localisation ILIKE $' + (params.length + 1);
    params.push(`%${localisation}%`);
  }
  
  if (prix_min) {
    query += ' AND prix >= $' + (params.length + 1);
    params.push(prix_min);
  }
  
  // ... autres filtres
  
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.listen(3000, () => {
  console.log('API démarrée sur le port 3000');
});
````

## Bonnes pratiques et recommandations

### Sécurité et éthique
- Respecter le `robots.txt`
- Implémenter des délais raisonnables
- Ne pas surcharger les serveurs
- Respecter les conditions d'utilisation

### Monitoring et maintenance
- Logs détaillés pour le debugging
- Alertes en cas d'échec
- Tests réguliers des sélecteurs
- Sauvegarde des données

### Optimisations
- Mise en cache des pages déjà visitées
- Parallélisation contrôlée
- Compression des données
- Nettoyage automatique des anciens datasets

Ce workshop fournit une base solide pour le web scraping industriel tout en respectant les bonnes pratiques techniques et éthiques.
/**
 * Applicazione per la gestione di marker su una mappa mondiale
 * Questo server gestisce l'autenticazione degli utenti e le operazioni CRUD sui marker
 */

// Importazione dei moduli necessari
const express = require('express');         // Framework web per Node.js
const session = require('express-session'); // Gestione delle sessioni utente
const FileStore = require('session-file-store')(session); // Salvataggio delle sessioni su file
const bcrypt = require('bcryptjs');        // Libreria per l'hashing delle password
const path = require('path');              // Gestione dei percorsi file
const fs = require('fs');                  // Operazioni sul filesystem
const bodyParser = require('body-parser');  // Parsing dei dati delle richieste HTTP

// Inizializzazione dell'applicazione Express
const app = express();
const port = 3000;

// Definizione dei percorsi dei file JSON per il salvataggio dei dati
const usersPath = path.join(__dirname, 'data', 'users.json');
const markersPath = path.join(__dirname, 'data', 'markers.json');

/**
 * Funzione per leggere un file JSON
 * @param {string} filePath - Percorso del file da leggere
 * @returns {Array} - Contenuto del file JSON come array
 */
const readJsonFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // In caso di errore, restituisce un array vuoto
        return [];
    }
};

/**
 * Funzione per scrivere dati in un file JSON
 * @param {string} filePath - Percorso del file da scrivere
 * @param {Object} data - Dati da salvare nel file
 */
const writeJsonFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Configurazione dei middleware di Express
app.use(bodyParser.json());                      // Parsing dei dati JSON
app.use(bodyParser.urlencoded({ extended: true })); // Parsing dei dati form
app.use(express.static('public'));               // Servire file statici dalla cartella 'public'
app.set('view engine', 'ejs');                   // Impostazione di EJS come motore di template

// Creazione della cartella per le sessioni se non esiste
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Configurazione del middleware per la gestione delle sessioni
app.use(session({
    store: new FileStore({                // Salvataggio delle sessioni su file
        path: sessionsDir,
        retries: 0,
        logFn: () => {}
    }),
    secret: 'your_secret_key',           // Chiave segreta per firmare il cookie di sessione
    resave: false,                       // Non salvare la sessione se non è stata modificata
    saveUninitialized: false,            // Non salvare sessioni non inizializzate
    cookie: { secure: false }            // Cookie non sicuro (non HTTPS)
}));

/**
 * Middleware per verificare se l'utente è autenticato
 * Reindirizza alla pagina di login se l'utente non è autenticato
 */
const requireLogin = (req, res, next) => {
    if (req.session.userId) {
        next(); // Utente autenticato, procedi alla route successiva
    } else {
        res.redirect('/login'); // Utente non autenticato, reindirizza al login
    }
};

// ROTTE PER L'AUTENTICAZIONE

/**
 * Pagina di login
 */
app.get('/login', (req, res) => {
    res.render('login');
});

/**
 * Pagina di registrazione
 */
app.get('/register', (req, res) => {
    res.render('register');
});

/**
 * Gestione della registrazione utente
 * Crea un nuovo utente con password criptata
 */
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = readJsonFile(usersPath);
        // Verifica se l'username è già in uso
        if (users.find(u => u.username === username)) {
            res.status(400).json({ error: 'Username già in uso' });
            return;
        }

        // Cripta la password e crea il nuovo utente
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            password: hashedPassword
        };

        // Salva il nuovo utente e reindirizza alla pagina di login
        users.push(newUser);
        writeJsonFile(usersPath, users);
        res.redirect('/login');
    } catch (error) {
        res.status(500).json({ error: 'Errore durante la registrazione' });
    }
});

/**
 * Gestione del login utente
 * Verifica le credenziali e crea una sessione
 */
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = readJsonFile(usersPath);
    const user = users.find(u => u.username === username);

    // Verifica se l'utente esiste
    if (!user) {
        res.render('login', { error: 'Utente non trovato' });
        return;
    }

    try {
        // Verifica la password
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            // Crea la sessione e reindirizza alla mappa
            req.session.userId = user.id;
            res.redirect('/map');
        } else {
            res.render('login', { error: 'Password non valida' });
        }
    } catch (error) {
        res.render('login', { error: 'Errore del server' });
    }
});

/**
 * Gestione del logout
 * Distrugge la sessione e reindirizza al login
 */
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ROTTE PER LA MAPPA E I MARKER

/**
 * Pagina principale della mappa
 * Richiede autenticazione
 */
app.get('/map', requireLogin, (req, res) => {
    res.render('map', { session: { userId: req.session.userId } });
});

/**
 * API per ottenere tutti i marker
 * Aggiunge il nome utente a ciascun marker
 */
app.get('/api/markers', requireLogin, (req, res) => {
    const markers = readJsonFile(markersPath);
    const users = readJsonFile(usersPath);
    // Aggiunge il nome utente a ciascun marker
    const markersWithUsernames = markers.map(marker => {
        const user = users.find(u => u.id === marker.user_id);
        return {
            ...marker,
            username: user ? user.username : 'Utente sconosciuto'
        };
    });
    res.json(markersWithUsernames);
});

/**
 * API per creare un nuovo marker
 * Richiede autenticazione
 */
app.post('/api/markers', requireLogin, (req, res) => {
    const { name, description, latitude, longitude } = req.body;
    const markers = readJsonFile(markersPath);
    
    // Crea un nuovo marker con ID incrementale
    const newMarker = {
        id: markers.length > 0 ? Math.max(...markers.map(m => m.id)) + 1 : 1,
        user_id: req.session.userId,
        name,
        description,
        latitude,
        longitude
    };

    // Salva il nuovo marker e lo restituisce come risposta
    markers.push(newMarker);
    writeJsonFile(markersPath, markers);
    res.json(newMarker);
});

/**
 * API per aggiornare un marker esistente
 * Verifica che l'utente sia il proprietario del marker
 */
app.put('/api/markers/:id', requireLogin, (req, res) => {
    const { name, description, latitude, longitude } = req.body;
    const markers = readJsonFile(markersPath);
    // Trova il marker da aggiornare (solo se appartiene all'utente corrente)
    const markerIndex = markers.findIndex(m => m.id === parseInt(req.params.id) && m.user_id === req.session.userId);

    if (markerIndex === -1) {
        res.status(404).json({ error: 'Marker non trovato' });
        return;
    }

    // Aggiorna il marker e lo salva
    markers[markerIndex] = {
        ...markers[markerIndex],
        name,
        description,
        latitude,
        longitude
    };

    writeJsonFile(markersPath, markers);
    res.json(markers[markerIndex]);
});

/**
 * API per eliminare un marker
 * Verifica che l'utente sia il proprietario del marker
 */
app.delete('/api/markers/:id', requireLogin, (req, res) => {
    const markers = readJsonFile(markersPath);
    // Filtra i marker rimuovendo quello da eliminare (solo se appartiene all'utente corrente)
    const filteredMarkers = markers.filter(m => !(m.id === parseInt(req.params.id) && m.user_id === req.session.userId));

    if (filteredMarkers.length === markers.length) {
        res.status(404).json({ error: 'Marker non trovato' });
        return;
    }

    // Salva i marker aggiornati
    writeJsonFile(markersPath, filteredMarkers);
    res.json({ message: 'Marker eliminato con successo' });
});

// Avvio del server
app.listen(port, () => {
    console.log(`Server in esecuzione sulla porta http://localhost:${port}/login`);
});
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Percorsi dei file JSON
const usersPath = path.join(__dirname, 'data', 'users.json');
const markersPath = path.join(__dirname, 'data', 'markers.json');

// Funzioni di utilità per la gestione dei file JSON
const readJsonFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeJsonFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Configurazione middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Assicurati che la cartella sessions esista
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

// Configurazione sessione
app.use(session({
    store: new FileStore({
        path: sessionsDir,
        retries: 0,
        logFn: () => {}
    }),
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Middleware per verificare l'autenticazione
const requireLogin = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Rotte per l'autenticazione
app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = readJsonFile(usersPath);
        if (users.find(u => u.username === username)) {
            res.status(400).json({ error: 'Username già in uso' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
            username,
            password: hashedPassword
        };

        users.push(newUser);
        writeJsonFile(usersPath, users);
        res.redirect('/login');
    } catch (error) {
        res.status(500).json({ error: 'Errore durante la registrazione' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = readJsonFile(usersPath);
    const user = users.find(u => u.username === username);

    if (!user) {
        res.render('login', { error: 'Utente non trovato' });
        return;
    }

    try {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.userId = user.id;
            res.redirect('/map');
        } else {
            res.render('login', { error: 'Password non valida' });
        }
    } catch (error) {
        res.render('login', { error: 'Errore del server' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Rotte per la mappa e i marker
app.get('/map', requireLogin, (req, res) => {
    res.render('map', { session: { userId: req.session.userId } });
});

app.get('/api/markers', requireLogin, (req, res) => {
    const markers = readJsonFile(markersPath);
    const users = readJsonFile(usersPath);
    const markersWithUsernames = markers.map(marker => {
        const user = users.find(u => u.id === marker.user_id);
        return {
            ...marker,
            username: user ? user.username : 'Utente sconosciuto'
        };
    });
    res.json(markersWithUsernames);
});

app.post('/api/markers', requireLogin, (req, res) => {
    const { name, description, latitude, longitude } = req.body;
    const markers = readJsonFile(markersPath);
    
    const newMarker = {
        id: markers.length > 0 ? Math.max(...markers.map(m => m.id)) + 1 : 1,
        user_id: req.session.userId,
        name,
        description,
        latitude,
        longitude
    };

    markers.push(newMarker);
    writeJsonFile(markersPath, markers);
    res.json(newMarker);
});

app.put('/api/markers/:id', requireLogin, (req, res) => {
    const { name, description, latitude, longitude } = req.body;
    const markers = readJsonFile(markersPath);
    const markerIndex = markers.findIndex(m => m.id === parseInt(req.params.id) && m.user_id === req.session.userId);

    if (markerIndex === -1) {
        res.status(404).json({ error: 'Marker non trovato' });
        return;
    }

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

app.delete('/api/markers/:id', requireLogin, (req, res) => {
    const markers = readJsonFile(markersPath);
    const filteredMarkers = markers.filter(m => !(m.id === parseInt(req.params.id) && m.user_id === req.session.userId));

    if (filteredMarkers.length === markers.length) {
        res.status(404).json({ error: 'Marker non trovato' });
        return;
    }

    writeJsonFile(markersPath, filteredMarkers);
    res.json({ message: 'Marker eliminato con successo' });
});

app.listen(port, () => {
    console.log(`Server in esecuzione sulla porta https://localhost:${port}/login`);
});
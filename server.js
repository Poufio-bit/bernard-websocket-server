// server.js - Serveur WebSocket pour Render.com
const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware pour parser JSON
app.use(express.json());

// Créer le serveur HTTP
const server = http.createServer(app);

// État des connexions
const connections = {
    bernard: "disconnected",
    liliann: "disconnected",
    active_sessions: 0
};

// Map pour stocker les WebSockets par client
const clientSockets = new Map();

// Route HTTP pour vérifier l'état
app.get('/', (req, res) => {
    res.json({
        service: "Ecoute Boubouh Server",
        version: "1.0.0",
        status: "running",
        connections: connections,
        timestamp: new Date().toISOString()
    });
});

// Route de santé pour Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// Créer le serveur WebSocket sur le MÊME port que HTTP
const wss = new WebSocket.Server({ 
    server: server,
    path: '/'
});

console.log('🚀 Serveur WebSocket configuré sur le même port que HTTP');

// Fonction pour mettre à jour les statistiques
function updateStats() {
    connections.active_sessions = clientSockets.size;
    console.log('📊 Stats mises à jour:', connections);
}

// Gestion des connexions WebSocket
wss.on('connection', (ws, req) => {
    console.log('📱 Nouvelle connexion WebSocket');
    console.log('🔍 IP:', req.socket.remoteAddress);
    console.log('🔍 User-Agent:', req.headers['user-agent']);
    
    let clientName = null;
    let connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Envoyer un message de bienvenue
    ws.send(JSON.stringify({
        type: "welcome",
        message: "Connexion WebSocket établie! Envoyez 'bernard' ou 'liliann' pour vous identifier.",
        connectionId: connectionId,
        timestamp: new Date().toISOString()
    }));
    
    ws.on('message', (message) => {
        const messageStr = message.toString();
        console.log('📥 Message reçu:', messageStr);
        console.log('📥 De:', clientName || 'non-identifié');
        
        // Essayer de parser en JSON d'abord
        try {
            const data = JSON.parse(messageStr);
            console.log('📄 JSON parsé:', data);
            
            if (data.type === "connect" && data.user) {
                clientName = data.user;
            } else if (data.action === "identify" && data.device) {
                clientName = data.device;
            } else if (data.type === "identify" && data.role) {
                clientName = data.role;
            }
        } catch (e) {
            // Si ce n'est pas du JSON, peut-être juste le nom
            console.log('📄 Message texte simple:', messageStr);
            if (messageStr === "bernard" || messageStr === "liliann") {
                clientName = messageStr;
            }
        }
        
        // Si on a identifié un client valide
        if (clientName && (clientName === "bernard" || clientName === "liliann")) {
            console.log(`✅ Client identifié: ${clientName}`);
            
            // Déconnecter l'ancien client s'il existe
            if (clientSockets.has(clientName)) {
                const oldSocket = clientSockets.get(clientName);
                if (oldSocket !== ws && oldSocket.readyState === WebSocket.OPEN) {
                    oldSocket.send(JSON.stringify({
                        type: "disconnected",
                        reason: "Nouvelle connexion du même client",
                        timestamp: new Date().toISOString()
                    }));
                    oldSocket.close();
                }
            }
            
            // Enregistrer le nouveau client
            clientSockets.set(clientName, ws);
            connections[clientName] = "connected";
            updateStats();
            
            // Confirmer la connexion
            const confirmationMessage = {
                type: "connection_confirmed",
                client: clientName,
                status: "connected",
                message: `Bonjour ${clientName}! Connexion réussie.`,
                connectionId: connectionId,
                timestamp: new Date().toISOString()
            };
            
            ws.send(JSON.stringify(confirmationMessage));
            console.log('✅ Confirmation envoyée à', clientName);
            
        } else {
            // Message de debug pour comprendre ce qui arrive
            const debugMessage = {
                type: "debug",
                received: messageStr,
                message: "Message reçu mais format non reconnu. Essayez 'bernard' ou 'liliann'",
                expectedFormats: [
                    "bernard",
                    "liliann", 
                    '{"type":"connect","user":"bernard"}',
                    '{"action":"identify","device":"bernard"}'
                ],
                timestamp: new Date().toISOString()
            };
            
            ws.send(JSON.stringify(debugMessage));
            console.log('🐛 Message de debug envoyé');
        }
    });
    
    ws.on('close', (code, reason) => {
        console.log(`👋 Connexion fermée pour: ${clientName || 'non-identifié'}`);
        console.log(`👋 Code: ${code}, Raison: ${reason}`);
        
        if (clientName && clientSockets.get(clientName) === ws) {
            clientSockets.delete(clientName);
            connections[clientName] = "disconnected";
            updateStats();
            console.log(`🔌 ${clientName} marqué comme déconnecté`);
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error);
        if (clientName && clientSockets.get(clientName) === ws) {
            clientSockets.delete(clientName);
            connections[clientName] = "disconnected";
            updateStats();
        }
    });
    
    // Ping périodique pour maintenir la connexion
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        } else {
            clearInterval(pingInterval);
        }
    }, 30000); // Ping toutes les 30 secondes
});

// Nettoyage périodique des connexions fermées
setInterval(() => {
    clientSockets.forEach((socket, clientName) => {
        if (socket.readyState !== WebSocket.OPEN) {
            console.log(`🧹 Nettoyage connexion fermée: ${clientName}`);
            clientSockets.delete(clientName);
            connections[clientName] = "disconnected";
        }
    });
    updateStats();
}, 60000); // Vérification toutes les minutes

// Démarrer le serveur
server.listen(PORT, () => {
    console.log(`🌐 Serveur démarré sur le port ${PORT}`);
    console.log(`📡 HTTP: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('✅ WebSocket et HTTP sur le MÊME port (requis par Render)');
    console.log('📋 Clients supportés: bernard, liliann');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du serveur...');
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});
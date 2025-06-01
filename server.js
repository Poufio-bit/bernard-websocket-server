// server.js - Serveur WebSocket pour Render.com - VERSION COMPLÈTE AVEC HEARTBEAT + TIMEOUT
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

// NOUVEAU: Stockage des heartbeats pour détecter les timeouts
const userHeartbeats = {
    bernard: null,
    liliann: null
};

// NOUVEAU: Fonction pour mettre à jour le heartbeat
function updateHeartbeat(userId) {
    userHeartbeats[userId] = Date.now();
    console.log(`💓 Heartbeat reçu de ${userId} à ${new Date().toLocaleTimeString()}`);
}

// NOUVEAU: Fonction pour vérifier les timeouts
function checkTimeouts() {
    const now = Date.now();
    const TIMEOUT_MS = 45000; // 45 secondes de timeout
    
    Object.keys(connections).forEach(userId => {
        if (connections[userId] === "connected") {
            const lastHeartbeat = userHeartbeats[userId];
            const userSocket = clientSockets.get(userId);
            
            if (lastHeartbeat && userSocket && (now - lastHeartbeat) > TIMEOUT_MS) {
                console.log(`⏰ TIMEOUT détecté pour ${userId}`);
                console.log(`   Dernière activité: ${new Date(lastHeartbeat).toLocaleTimeString()}`);
                console.log(`   Temps écoulé: ${Math.round((now - lastHeartbeat) / 1000)}s`);
                
                // Marquer comme déconnecté
                clientSockets.delete(userId);
                connections[userId] = "disconnected";
                userHeartbeats[userId] = null;
                
                // Fermer la connexion WebSocket
                try {
                    userSocket.close(1001, 'Timeout - pas de heartbeat');
                } catch (e) {
                    console.log(`⚠️ Erreur fermeture ${userId}: ${e.message}`);
                }
                
                // Notifier les autres utilisateurs du changement de statut
                broadcastUserStatus();
                
                console.log(`🔌 ${userId} déconnecté automatiquement (timeout)`);
                console.log(`📊 Utilisateurs actifs: ${Object.keys(connections).filter(u => connections[u] === 'connected').join(', ')}`);
                updateStats();
            }
        }
    });
}

// NOUVEAU: Démarrer la vérification périodique des timeouts
setInterval(checkTimeouts, 10000); // Vérifier toutes les 10 secondes
console.log('⏰ Système de timeout démarré (vérification toutes les 10s, timeout 45s)');

// Route HTTP pour vérifier l'état
app.get('/', (req, res) => {
    res.json({
        service: "Ecoute Boubouh Server",
        version: "2.2.0 - Audio Support + Bernard Listening + Heartbeat + Timeout",
        status: "running",
        connections: connections,
        heartbeats: {
            bernard: userHeartbeats.bernard ? new Date(userHeartbeats.bernard).toISOString() : null,
            liliann: userHeartbeats.liliann ? new Date(userHeartbeats.liliann).toISOString() : null
        },
        features: ["identification", "audio_streaming", "real_time_communication", "bernard_listening", "heartbeat", "timeout_detection"],
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

// FONCTION: Gérer les données audio
function handleAudioData(data, fromClient) {
    console.log(`🎵 Traitement audio de ${fromClient}`);
    
    const { from, to, data: audioData, sampleRate, format, channels } = data;
    
    // Validation des données
    if (!audioData || audioData.length === 0) {
        console.error('❌ Données audio vides');
        return;
    }
    
    if (!to || (to !== 'bernard' && to !== 'liliann')) {
        console.error(`❌ Destinataire invalide: ${to}`);
        return;
    }
    
    // Vérifier que l'expéditeur correspond au client connecté
    if (from !== fromClient) {
        console.error(`❌ Expéditeur incohérent: ${from} vs ${fromClient}`);
        return;
    }
    
    console.log(`🎵 Audio de ${from} vers ${to} - Taille: ${audioData.length} caractères`);
    
    // Préparer le message audio pour le destinataire
    const audioMessage = {
        type: 'audio_data',
        from: from,
        to: to,
        data: audioData,
        sampleRate: sampleRate || 44100,
        format: format || 'PCM_16BIT',
        channels: channels || 1,
        timestamp: new Date().toISOString()
    };
    
    // Envoyer l'audio au destinataire
    const targetSocket = clientSockets.get(to);
    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
        try {
            targetSocket.send(JSON.stringify(audioMessage));
            console.log(`✅ Audio transféré de ${from} vers ${to}`);
        } catch (error) {
            console.error(`❌ Erreur envoi audio vers ${to}:`, error.message);
        }
    } else {
        console.log(`⚠️ ${to} non connecté - audio ignoré`);
        
        // Informer l'expéditeur que le destinataire n'est pas disponible
        const notificationMessage = {
            type: 'delivery_failed',
            target: to,
            reason: 'Client non connecté',
            timestamp: new Date().toISOString()
        };
        
        const senderSocket = clientSockets.get(fromClient);
        if (senderSocket && senderSocket.readyState === WebSocket.OPEN) {
            try {
                senderSocket.send(JSON.stringify(notificationMessage));
            } catch (error) {
                console.error(`❌ Erreur notification vers ${fromClient}:`, error.message);
            }
        }
    }
}

// FONCTION: Broadcaster le statut des utilisateurs
function broadcastUserStatus() {
    const userStatusMessage = {
        type: "user_status",
        users: {
            bernard: connections.bernard,
            liliann: connections.liliann
        },
        timestamp: new Date().toISOString()
    };
    
    console.log(`📡 Diffusion statut utilisateurs: Bernard=${connections.bernard}, Liliann=${connections.liliann}`);
    
    clientSockets.forEach((socket, name) => {
        if (socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify(userStatusMessage));
            } catch (error) {
                console.error(`❌ Erreur broadcast status vers ${name}:`, error.message);
            }
        }
    });
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
        server: "Ecoute Boubouh Server v2.2",
        features: ["audio_streaming", "real_time_communication", "bernard_listening", "heartbeat", "timeout_detection"],
        connectionId: connectionId,
        timestamp: new Date().toISOString()
    }));
    
    ws.on('message', (message) => {
        const messageStr = message.toString();
        console.log('📥 Message reçu:', messageStr.length > 100 ? messageStr.substring(0, 100) + '...' : messageStr);
        console.log('📥 De:', clientName || 'non-identifié');
        
        // Essayer de parser en JSON d'abord
        try {
            const data = JSON.parse(messageStr);
            console.log('📄 JSON parsé - Type:', data.type);
            
            // NOUVEAU: Gérer les heartbeats
            if (data.type === "heartbeat") {
                const from = data.from;
                if (from && (from === "bernard" || from === "liliann")) {
                    updateHeartbeat(from);
                    // Pas besoin de répondre au heartbeat, juste l'enregistrer
                    return;
                } else {
                    console.log(`⚠️ Heartbeat invalide de: ${from}`);
                    return;
                }
            }
            
            // NOUVEAU: Gérer la batterie de Liliann
            if (data.type === "liliann_battery") {
                const batteryLevel = data.battery_level || 0;
                const from = data.from;
                console.log(`🔋 Batterie Liliann: ${batteryLevel}%`);
                
                // Mettre à jour le heartbeat aussi (la batterie indique que Liliann est vivante)
                if (from === "liliann") {
                    updateHeartbeat("liliann");
                }
                
                // Transférer à Bernard s'il est connecté
                const bernardSocket = clientSockets.get("bernard");
                if (bernardSocket && bernardSocket.readyState === WebSocket.OPEN) {
                    try {
                        bernardSocket.send(JSON.stringify(data));
                        console.log(`✅ Batterie Liliann envoyée à Bernard: ${batteryLevel}%`);
                    } catch (error) {
                        console.error(`❌ Erreur envoi batterie vers Bernard:`, error.message);
                    }
                } else {
                    console.log(`⚠️ Bernard non connecté - batterie ignorée`);
                }
                return;
            }
            
            // Gérer bernard_listening
            if (data.type === "bernard_listening") {
                const listening = data.listening;
                const from = data.from;
                console.log(`🎧 Bernard listening: ${listening}`);
                
                // Mettre à jour le heartbeat aussi
                if (from === "bernard") {
                    updateHeartbeat("bernard");
                }
                
                // Envoyer le message à Liliann
                const liliannSocket = clientSockets.get("liliann");
                if (liliannSocket && liliannSocket.readyState === WebSocket.OPEN) {
                    try {
                        liliannSocket.send(JSON.stringify({
                            type: "bernard_listening",
                            listening: listening,
                            from: "bernard",
                            timestamp: new Date().toISOString()
                        }));
                        console.log(`✅ Message listening envoyé à Liliann: ${listening}`);
                    } catch (error) {
                        console.error(`❌ Erreur envoi vers Liliann:`, error.message);
                    }
                } else {
                    console.log(`⚠️ Liliann non connectée`);
                }
                return;
            }
            
            // Gérer les différents types de messages
            if (data.type === "audio_data") {
                // Mettre à jour le heartbeat pour l'activité audio
                if (data.from && (data.from === "bernard" || data.from === "liliann")) {
                    updateHeartbeat(data.from);
                }
                
                // Traitement des données audio
                if (clientName) {
                    handleAudioData(data, clientName);
                } else {
                    console.error('❌ Tentative d\'envoi audio sans identification');
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Vous devez d'abord vous identifier avant d'envoyer de l'audio",
                        timestamp: new Date().toISOString()
                    }));
                }
                return;
            } else if (data.type === "ping") {
                // Mettre à jour le heartbeat pour les pings
                if (clientName) {
                    updateHeartbeat(clientName);
                }
                
                // Répondre aux pings
                ws.send(JSON.stringify({
                    type: "pong",
                    timestamp: new Date().toISOString()
                }));
                return;
            } else if (data.type === "status_request") {
                // Envoyer le statut des utilisateurs
                ws.send(JSON.stringify({
                    type: "user_status",
                    users: {
                        bernard: connections.bernard,
                        liliann: connections.liliann
                    },
                    timestamp: new Date().toISOString()
                }));
                return;
            }
            
            // Traitement de l'identification
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
            
            // NOUVEAU: Initialiser le heartbeat
            updateHeartbeat(clientName);
            
            updateStats();
            
            // Confirmer la connexion
            const confirmationMessage = {
                type: "connection_confirmed",
                client: clientName,
                status: "connected",
                message: `Bonjour ${clientName}! Connexion réussie. Audio streaming + bernard_listening + heartbeat disponibles.`,
                connectionId: connectionId,
                timestamp: new Date().toISOString()
            };
            
            ws.send(JSON.stringify(confirmationMessage));
            console.log('✅ Confirmation envoyée à', clientName);
            
            // Broadcaster le statut des utilisateurs à tous les clients
            broadcastUserStatus();
            
        } else if (clientName) {
            // Le client est déjà identifié, traiter d'autres messages
            console.log(`📨 Message de ${clientName}:`, messageStr.substring(0, 50) + '...');
            
        } else {
            // Message de debug pour comprendre ce qui arrive
            const debugMessage = {
                type: "debug",
                received: messageStr.substring(0, 100),
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
            userHeartbeats[clientName] = null; // NOUVEAU: Nettoyer le heartbeat
            updateStats();
            console.log(`🔌 ${clientName} marqué comme déconnecté`);
            
            // Broadcaster le nouveau statut
            broadcastUserStatus();
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error);
        if (clientName && clientSockets.get(clientName) === ws) {
            clientSockets.delete(clientName);
            connections[clientName] = "disconnected";
            userHeartbeats[clientName] = null; // NOUVEAU: Nettoyer le heartbeat
            updateStats();
            broadcastUserStatus();
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
    let cleanupNeeded = false;
    
    clientSockets.forEach((socket, clientName) => {
        if (socket.readyState !== WebSocket.OPEN) {
            console.log(`🧹 Nettoyage connexion fermée: ${clientName}`);
            clientSockets.delete(clientName);
            connections[clientName] = "disconnected";
            userHeartbeats[clientName] = null; // NOUVEAU: Nettoyer le heartbeat
            cleanupNeeded = true;
        }
    });
    
    if (cleanupNeeded) {
        updateStats();
        broadcastUserStatus();
    }
}, 60000); // Vérification toutes les minutes

// Ping serveur périodique pour tous les clients
setInterval(() => {
    const serverPingMessage = {
        type: "server_ping",
        timestamp: new Date().toISOString()
    };
    
    clientSockets.forEach((socket, clientName) => {
        if (socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(JSON.stringify(serverPingMessage));
            } catch (error) {
                console.error(`❌ Erreur ping vers ${clientName}:`, error.message);
            }
        }
    });
}, 25000); // Ping toutes les 25 secondes (sync avec l'app Android)

// NOUVEAU: Fonction utilitaire pour logging du statut serveur
function logServerStatus() {
    console.log('\n=== STATUT SERVEUR ===');
    console.log(`🕐 ${new Date().toLocaleString()}`);
    console.log(`👥 Utilisateurs connectés: ${Object.keys(connections).filter(u => connections[u] === 'connected').length}`);
    
    Object.keys(connections).forEach(userId => {
        if (connections[userId] === 'connected') {
            const lastHB = userHeartbeats[userId];
            const timeSince = lastHB ? Math.round((Date.now() - lastHB) / 1000) : 'jamais';
            console.log(`   - ${userId}: dernier heartbeat il y a ${timeSince}s`);
        }
    });
    console.log('======================\n');
}

// Afficher le statut toutes les 2 minutes
setInterval(logServerStatus, 120000);

// Démarrer le serveur
server.listen(PORT, () => {
    console.log(`🌐 Serveur démarré sur le port ${PORT}`);
    console.log(`📡 HTTP: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log('✅ WebSocket et HTTP sur le MÊME port (requis par Render)');
    console.log('📋 Clients supportés: bernard, liliann');
    console.log('🎵 Fonctionnalités: identification + streaming audio temps réel + bernard_listening + heartbeat + timeout');
    console.log('💓 Heartbeat: 15s côté client, timeout 45s côté serveur');
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
    console.log('🛑 Arrêt du serveur...');
    
    // Fermer toutes les connexions WebSocket proprement
    clientSockets.forEach((socket, clientName) => {
        try {
            socket.send(JSON.stringify({
                type: "server_shutdown",
                message: "Serveur en cours d'arrêt",
                timestamp: new Date().toISOString()
            }));
            socket.close(1001, 'Serveur en cours d\'arrêt');
        } catch (error) {
            console.error(`❌ Erreur fermeture ${clientName}:`, error.message);
        }
    });
    
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 Interruption reçue - Arrêt du serveur...');
    process.emit('SIGTERM');
});

// Logging des statistiques périodiques
setInterval(() => {
    const connectedClients = Array.from(clientSockets.keys());
    console.log(`📊 Clients connectés: [${connectedClients.join(', ')}] - Total: ${connectedClients.length}`);
}, 300000); // Toutes les 5 minutes

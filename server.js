// Gestion des connexions WebSocket
wss.on('connection', (ws, req) => {
    console.log('📱 Nouvelle connexion WebSocket');
    console.log('🔍 IP:', req.socket.remoteAddress);
    
    let clientName = null;
    let connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Message de bienvenue
    ws.send(JSON.stringify({
        type: "welcome",
        message: "Connexion WebSocket établie! Envoyez 'bernard' ou 'liliann' pour vous identifier.",
        server: "Ecoute Boubouh Server v2.0",
        features: ["audio_streaming", "real_time_communication"],
        connectionId: connectionId,
        timestamp: new Date().toISOString()
    }));
    
    ws.on('message', (message) => {
        const messageStr = message.toString();
        console.log('📥 Message:', messageStr.length > 100 ? messageStr.substring(0, 100) + '...' : messageStr);
        console.log('📥 De:', clientName || 'non-identifié');
        
        try {
            const data = JSON.parse(messageStr);
            console.log('📄 JSON - Type:', data.type);
            
            // NOUVEAU: Gérer bernard_listening
            if (data.type === "bernard_listening") {
                const listening = data.listening;
                console.log(`🎧 Bernard listening: ${listening}`);
                
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
            
            // GESTION AUDIO
            if (data.type === "audio_data") {
                if (clientName) {
                    handleAudioData(data, clientName);
                } else {
                    console.error('❌ Audio sans identification');
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Identification requise avant envoi audio",
                        timestamp: new Date().toISOString()
                    }));
                }
                return;
            } else if (data.type === "ping") {
                ws.send(JSON.stringify({
                    type: "pong",
                    timestamp: new Date().toISOString()
                }));
                return;
            } else if (data.type === "status_request") {
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
            
            // IDENTIFICATION
            if (data.type === "connect" && data.user) {
                clientName = data.user;
            } else if (data.action === "identify" && data.device) {
                clientName = data.device;
            } else if (data.type === "identify" && data.role) {
                clientName = data.role;
            }
        } catch (e) {
            console.log('📄 Message texte:', messageStr);
            if (messageStr === "bernard" || messageStr === "liliann") {
                clientName = messageStr;
            }
        }
        
        // TRAITEMENT IDENTIFICATION
        if (clientName && (clientName === "bernard" || clientName === "liliann")) {
            console.log(`✅ Client identifié: ${clientName}`);
            
            // Déconnecter ancien client
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
            
            // Enregistrer nouveau client
            clientSockets.set(clientName, ws);
            connections[clientName] = "connected";
            updateStats();
            
            // Confirmer connexion
            const confirmationMessage = {
                type: "connection_confirmed",
                client: clientName,
                status: "connected",
                message: `Bonjour ${clientName}! Connexion réussie. Audio streaming disponible.`,
                connectionId: connectionId,
                timestamp: new Date().toISOString()
            };
            
            ws.send(JSON.stringify(confirmationMessage));
            console.log('✅ Confirmation envoyée à', clientName);
            
            broadcastUserStatus();
            
        } else if (clientName) {
            console.log(`📨 Message de ${clientName}:`, messageStr.substring(0, 50) + '...');
        } else {
            const debugMessage = {
                type: "debug",
                received: messageStr.substring(0, 100),
                message: "Format non reconnu. Essayez 'bernard' ou 'liliann'",
                expectedFormats: ["bernard", "liliann", '{"type":"connect","user":"bernard"}'],
                timestamp: new Date().toISOString()
            };
            
            ws.send(JSON.stringify(debugMessage));
            console.log('🐛 Debug envoyé');
        }
    });

    // Gestion de la fermeture de connexion
    ws.on('close', () => {
        if (clientName) {
            console.log(`❌ ${clientName} déconnecté`);
            connections[clientName] = "disconnected";
            clientSockets.delete(clientName);
            updateStats();
            broadcastUserStatus();
        } else {
            console.log('❌ Connexion non-identifiée fermée');
        }
    });

    // Gestion des erreurs
    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error.message);
        if (clientName) {
            connections[clientName] = "error";
            updateStats();
        }
    });
});

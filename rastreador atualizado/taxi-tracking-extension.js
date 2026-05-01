/**
 * TAXI TRACKING EXTENSION
 * Extensão JavaScript para rastrear motoristas via WebView
 * 
 * Este código é injetado no WebView do app de táxi para:
 * - Rastrear localização em tempo real
 * - Enviar notificações do sistema para a central
 * - Funcionar em background quando app fechado
 * 
 * @version 1.0.0
 */

(function() {
    'use strict';

    // ==========================================
    // CONSTANTS
    // ==========================================
    const LOCATION_TASK_NAME = 'background-location-task';
    const DEFAULT_SPEED_LIMIT = 60; // km/h
    const DEFAULT_UPDATE_INTERVAL = 5000; // 5 segundos
    const DEFAULT_DISTANCE_FILTER = 10; // metros

    // ==========================================
    // STATE
    // ==========================================
    let state = {
        isTracking: false,
        driverId: null,
        driverName: 'Motorista',
        currentLocation: null,
        speedLimit: DEFAULT_SPEED_LIMIT,
        locationHistory: [],
        maxHistorySize: 100,
        lastSpeed: 0,
        speedWarningShown: false,
        watchId: null,
        isConnected: true
    };

    // ==========================================
    // BROADCAST CHANNEL (WebView Bridge)
    // ==========================================
    const channelName = 'taxi-tracking-channel';
    let broadcastChannel = null;

    function initBroadcastChannel() {
        try {
            broadcastChannel = new BroadcastChannel(channelName);
            broadcastChannel.onmessage = handleBroadcastMessage;
            log('BroadcastChannel initialized');
        } catch (e) {
            log('BroadcastChannel not supported:', e);
        }
    }

    function handleBroadcastMessage(event) {
        const message = event.data;
        log('Broadcast received:', message.type);
        
        switch (message.type) {
            case 'trip_started':
                startTracking(message.driverId, message.driverName);
                break;
            case 'trip_ended':
                stopTracking();
                break;
            case 'location_request':
                sendLocationToNative();
                break;
            case 'speed_limit_changed':
                state.speedLimit = message.limit;
                break;
        }
    }

    function sendBroadcast(message) {
        if (broadcastChannel) {
            broadcastChannel.postMessage(message);
        }
    }

    // ==========================================
    // NATIVE BRIDGE (Android/iOS WebView)
    // ==========================================
    function sendToNative(message) {
        const payload = JSON.stringify(message);
        
        // Android WebView
        if (typeof window.AndroidBridge !== 'undefined') {
            window.AndroidBridge.postMessage(payload);
            return;
        }
        
        // iOS WKWebView
        if (typeof window.webkit !== 'undefined' && 
            window.webkit.messageHandlers && 
            window.webkit.messageHandlers.bridge) {
            window.webkit.messageHandlers.bridge.postMessage(message);
            return;
        }
        
        // Fallback: console
        log('Native message:', payload);
    }

    function receiveFromNative(callback) {
        window.receiveFromNative = callback;
        
        // Android interface
        if (typeof window.AndroidBridge !== 'undefined') {
            window.AndroidBridge.setMessageHandler(function(message) {
                try {
                    const data = JSON.parse(message);
                    callback(data);
                } catch (e) {
                    log('Parse error:', e);
                }
            });
        }
    }

    // ==========================================
    // LOCATION TRACKING
    // ==========================================
    function startTracking(driverId, driverName) {
        if (state.isTracking) {
            log('Already tracking');
            return Promise.resolve();
        }

        return new Promise(async (resolve, reject) => {
            try {
                // Request permissions
                const hasPermission = await requestLocationPermission();
                if (!hasPermission) {
                    throw new Error('Location permission denied');
                }

                // Initialize tracking
                state.driverId = driverId || generateDriverId();
                state.driverName = driverName || 'Motorista';
                state.isTracking = true;
                state.locationHistory = [];
                state.lastSpeed = 0;
                state.speedWarningShown = false;

                // Start watching
                state.watchId = navigator.geolocation.watchPosition(
                    handleLocationUpdate,
                    handleLocationError,
                    {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 5000
                    }
                );

                // Notify native
                sendToNative({
                    type: 'tracking_started',
                    driverId: state.driverId
                });
                
                sendBroadcast({
                    type: 'tracking_started',
                    driverId: state.driverId
                });

                // Request background location (Android only)
                requestBackgroundLocation();

                log('Tracking started:', state.driverId);
                resolve();

            } catch (error) {
                log('Start tracking error:', error);
                reject(error);
            }
        });
    }

    function stopTracking() {
        if (!state.isTracking) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            if (state.watchId) {
                navigator.geolocation.clearWatch(state.watchId);
                state.watchId = null;
            }

            // Save route
            const routeData = {
                driverId: state.driverId,
                route: state.locationHistory,
                startTime: state.locationHistory[0]?.timestamp,
                endTime: state.locationHistory[state.locationHistory.length - 1]?.timestamp,
                totalPoints: state.locationHistory.length
            };

            // Notify native
            sendToNative({
                type: 'tracking_stopped',
                route: routeData
            });
            
            sendBroadcast({
                type: 'tracking_stopped',
                route: routeData
            });

            state.isTracking = false;
            log('Tracking stopped');
            resolve();
        });
    }

    function handleLocationUpdate(position) {
        const coords = position.coords;
        const location = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            altitude: coords.altitude,
            heading: coords.heading,
            speed: coords.speed,
            timestamp: position.timestamp
        };

        state.currentLocation = location;
        
        // Add to history
        state.locationHistory.unshift(location);
        if (state.locationHistory.length > state.maxHistorySize) {
            state.locationHistory.pop();
        }

        // Calculate speed
        calculateSpeed(location);

        // Check speed limit
        checkSpeedLimit();

        // Send to native
        sendToNative({
            type: 'location_update',
            location: location,
            driverId: state.driverId
        });

        // Broadcast to other tabs
        sendBroadcast({
            type: 'location_update',
            location: location,
            driverId: state.driverId
        });
    }

    function handleLocationError(error) {
        log('Location error:', error.message);
        
        sendToNative({
            type: 'location_error',
            error: error.message,
            code: error.code
        });
    }

    function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve(position.coords),
                (error) => reject(error),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        });
    }

    // ==========================================
    // SPEED CALCULATION
    // ==========================================
    function calculateSpeed(currentLocation) {
        if (state.locationHistory.length < 2) return;

        const lastLocation = state.locationHistory[1];
        const timeDiff = (currentLocation.timestamp - lastLocation.timestamp) / 1000;
        
        if (timeDiff > 0) {
            const distance = calculateDistance(
                lastLocation.lat,
                lastLocation.lng,
                currentLocation.lat,
                currentLocation.lng
            );
            
            // Speed in km/h
            state.lastSpeed = (distance / timeDiff) * 3600;
        }
    }

    function checkSpeedLimit() {
        if (state.lastSpeed > state.speedLimit && !state.speedWarningShown) {
            // Speed warning!
            state.speedWarningShown = true;
            
            sendSpeedAlert(state.lastSpeed);
            
            // Vibrate device
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
            
        } else if (state.lastSpeed <= state.speedLimit && state.speedWarningShown) {
            state.speedWarningShown = false;
        }
    }

    function sendSpeedAlert(speed) {
        const message = {
            type: 'speed_warning',
            speed: speed,
            limit: state.speedLimit,
            driverId: state.driverId
        };

        sendToNative(message);
        
        sendBroadcast(message);

        // Try local notification
        tryShowNotification(
            '⚠️ Velocidade Alta!',
            `Motorista ${state.driverName} exceeded speed limit: ${speed.toFixed(1)} km/h`
        );
    }

    // ==========================================
    // PERMISSIONS
    // ==========================================
    function requestLocationPermission() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(false);
                return;
            }

            navigator.permissions.query({ name: 'geolocation' })
                .then(result => {
                    if (result.state === 'granted') {
                        resolve(true);
                    } else if (result.state === 'prompt') {
                        // Will request on first use
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                })
                .catch(() => resolve(true)); // Assume allowed if API not available
        });
    }

    function requestBackgroundLocation() {
        // Request background location permission via native
        sendToNative({
            type: 'request_background_location'
        });
    }

    // ==========================================
    // NOTIFICATIONS
    // ==========================================
    function tryShowNotification(title, body) {
        // Try native notification
        if (typeof window.Notification !== 'undefined') {
            if (Notification.permission === 'granted') {
                new Notification(title, { body });
                return;
            }
            if (Notification.permission === 'prompt') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, { body });
                    }
                });
            }
        }

        // Try native bridge
        sendToNative({
            type: 'show_notification',
            title: title,
            body: body
        });
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function generateDriverId() {
        return 'driver_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function log(message, data) {
        console.log('[TaxiTracking]', message, data || '');
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    window.TaxiTracking = {
        // Start tracking a trip
        startTrip: function(driverId, driverName) {
            return startTracking(driverId, driverName);
        },

        // Stop tracking
        stopTrip: function() {
            return stopTracking();
        },

        // Get current location
        getLocation: function() {
            return getCurrentLocation();
        },

        // Check if tracking
        isActive: function() {
            return state.isTracking;
        },

        // Get current speed
        getSpeed: function() {
            return state.lastSpeed;
        },

        // Set speed limit
        setSpeedLimit: function(limit) {
            state.speedLimit = limit;
            log('Speed limit set to:', limit);
        },

        // Get tracking history
        getHistory: function() {
            return state.locationHistory;
        },

        // Get driver info
        getDriverInfo: function() {
            return {
                driverId: state.driverId,
                driverName: state.driverName,
                isTracking: state.isTracking
            };
        },

        // Send location manually
        sendLocation: function() {
            sendLocationToNative();
        }
    };

    function sendLocationToNative() {
        if (state.currentLocation) {
            sendToNative({
                type: 'location_update',
                location: state.currentLocation,
                driverId: state.driverId,
                speed: state.lastSpeed
            });
        }
    }

    // ==========================================
    // INITIALIZE
    // ==========================================
    function init() {
        log('Initializing...');
        
        // Initialize broadcast channel
        initBroadcastChannel();

        // Setup native bridge listener
        receiveFromNative(handleNativeMessage);

        // Notify ready
        sendToNative({
            type: 'extension_ready'
        });

        log('Extension ready');
    }

    function handleNativeMessage(message) {
        log('Native message:', message.type);
        
        switch (message.type) {
            case 'start_trip':
                startTracking(message.driverId, message.driverName)
                    .catch(err => log('Start trip error:', err));
                break;
                
            case 'stop_trip':
                stopTracking()
                    .catch(err => log('Stop trip error:', err));
                break;
                
            case 'get_location':
                sendLocationToNative();
                break;
                
            case 'set_driver':
                state.driverId = message.driverId;
                state.driverName = message.driverName;
                break;
                
            case 'set_speed_limit':
                state.speedLimit = message.limit;
                break;
        }
    }

    // Auto-init when loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

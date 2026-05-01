import React, { useState, useEffect } from 'react';
import LocationServiceWeb from './LocationServiceWeb';

function App() {
    const [isTracking, setIsTracking] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);

    useEffect(() => {
        // Check if tracking is already active on app start
        setIsTracking(LocationServiceWeb.isTracking);
    }, []);

    const handleToggleTracking = async () => {
        try {
            if (isTracking) {
                await LocationServiceWeb.stopTracking();
                setIsTracking(false);
                alert('Tracking Stopped: Location tracking has been stopped.');
            } else {
                await LocationServiceWeb.startTracking();
                setIsTracking(true);
                alert('Tracking Started: Location tracking has been started.');
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    const handleGetCurrentLocation = async () => {
        try {
            const location = await LocationServiceWeb.getCurrentLocation();
            setCurrentLocation(location);
            alert(`Current Location: Lat: ${location.coords.latitude}, Lon: ${location.coords.longitude}`);
        } catch (error) {
            alert('Error: Unable to get current location: ' + error.message);
        }
    };

    return (
        <div className="container">
            <h1 className="title">Taxi Driver Tracking</h1>
            <p className="status">
                Status: {isTracking ? 'Tracking Active' : 'Tracking Inactive'}
            </p>
            {currentLocation && (
                <p className="location">
                    Current: {currentLocation.coords.latitude.toFixed(4)}, {currentLocation.coords.longitude.toFixed(4)}
                </p>
            )}
            <button className="button" onClick={handleToggleTracking}>
                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
            </button>
            <div>
                <button className="button secondaryButton" onClick={handleGetCurrentLocation}>
                    Get Current Location
                </button>
                <p className="buttonText">Get Current Location</p>
            </div>
        </div>
    );
}

export default App;

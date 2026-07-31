import React, { useState, useEffect, useRef, useMemo } from 'react';
import Globe from 'react-globe.gl';
import * as satellite from 'satellite.js';
import * as THREE from 'three';
import './index.css';

function App() {
  const globeEl = useRef();
  const [satData, setSatData] = useState([]);
  const [time, setTime] = useState(new Date());
  const [selectedSatName, setSelectedSatName] = useState(null);

  useEffect(() => {
    // Fetch live TLE data from the locally cached dataset to bypass CORS/rate limits
    fetch('/data.txt')
      .then(r => r.text())
      .then(rawData => {
        const tleData = rawData.replace(/\r/g, '').split('\n');
        const sats = [];
        // Only load a subset (e.g. 500) to keep it performant
        for (let i = 0; i < 1500; i += 3) {
          if (!tleData[i] || !tleData[i+1] || !tleData[i+2]) break;
          const name = tleData[i].trim();
          const tle1 = tleData[i + 1].trim();
          const tle2 = tleData[i + 2].trim();
          
          try {
            const satrec = satellite.twoline2satrec(tle1, tle2);
            sats.push({ name, satrec, tle1, tle2 });
          } catch(e) {}
        }
        setSatData(sats);
      });

    const timer = setInterval(() => setTime(new Date()), 1000); // update every second
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Disable auto-rotate so they are easier to click
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = false;
    }
  }, []);

  const satPositions = useMemo(() => {
    const gmst = satellite.gstime(time);
    return satData.map(d => {
      try {
        const positionAndVelocity = satellite.propagate(d.satrec, time);
        const positionEci = positionAndVelocity.position;
        if (!positionEci) return null;
        
        const velocityEci = positionAndVelocity.velocity;
        let velocityKps = 0;
        if (velocityEci) {
          velocityKps = Math.sqrt(
            Math.pow(velocityEci.x, 2) +
            Math.pow(velocityEci.y, 2) +
            Math.pow(velocityEci.z, 2)
          );
        }

        const positionGd = satellite.eciToGeodetic(positionEci, gmst);
        const longitude = satellite.degreesLong(positionGd.longitude);
        const latitude = satellite.degreesLat(positionGd.latitude);
        const alt = positionGd.height;
        
        return {
          ...d,
          lat: latitude,
          lng: longitude,
          alt: alt / 6371, // scale to globe radius
          realAlt: alt,
          velocity: velocityKps
        };
      } catch (e) {
        return null;
      }
    }).filter(d => d !== null);
  }, [satData, time]);

  const activeSat = selectedSatName ? satPositions.find(s => s.name === selectedSatName) : null;
  
  let operator = "Unknown / Classified";
  if (activeSat) {
    const name = activeSat.name.toUpperCase();
    if (name.includes('STARLINK')) operator = "SpaceX";
    else if (name.includes('ONEWEB')) operator = "OneWeb";
    else if (name.includes('NOAA') || name.includes('GOES') || name.includes('EWS-G') || name.includes('SUOMI')) operator = "NOAA (USA)";
    else if (name.includes('DMSP')) operator = "US Department of Defense";
    else if (name.includes('ISS')) operator = "NASA / Roscosmos";
    else if (name.includes('GPS') || name.includes('NAVSTAR')) operator = "US Space Force";
    else if (name.includes('GALILEO')) operator = "European Space Agency";
    else if (name.includes('METEOSAT') || name.includes('METOP')) operator = "EUMETSAT (Europe)";
    else if (name.includes('GLONASS') || name.includes('COSMOS') || name.includes('METEOR') || name.includes('ELEKTRO')) operator = "Roscosmos (Russia)";
    else if (name.includes('IRIDIUM')) operator = "Iridium Communications";
    else if (name.includes('BEIDOU') || name.includes('FENGYUN')) operator = "CNSA (China)";
    else if (name.includes('INSAT')) operator = "ISRO (India)";
    else if (name.includes('HIMAWARI')) operator = "JMA (Japan)";
    else if (name.includes('COMS')) operator = "KARI (South Korea)";
  }

  return (
    <div className="app-container">
      <div className="header">
        <img src="/logo.png" alt="T5S" className="logo" />
        <div className="header-text">
          <h1>ORBITAL RADAR</h1>
          <p>Live Satellite Tracking • T5S Network</p>
        </div>
        <div className="live-badge">
          <div className="pulse"></div> LIVE
        </div>
      </div>
      
      <div className="bottom-panel">
        <div className="watermark-logo">
          <img src="/logo.png" alt="T5S Watermark" />
        </div>
        <div className="stats-panel">
          <div><strong>ACTIVE CONTACTS:</strong> {satPositions.length}</div>
          <div><strong>SYS TIME:</strong> {time.toISOString().split('T')[1].split('.')[0]} UTC</div>
        </div>
      </div>

      {activeSat && (
        <div className="sat-info-panel">
          <div className="sat-info-header">
            <h3>{activeSat.name}</h3>
            <button onClick={() => setSelectedSatName(null)}>×</button>
          </div>
          <div className="sat-info-body">
            <p style={{borderBottom: '1px solid rgba(255, 51, 102, 0.3)', paddingBottom: '10px', marginBottom: '10px'}}>
              <strong>OPERATOR:</strong> {operator}
            </p>
            <p><strong>LAT:</strong> {activeSat.lat.toFixed(4)}°</p>
            <p><strong>LNG:</strong> {activeSat.lng.toFixed(4)}°</p>
            <p><strong>ALT:</strong> {Math.round(activeSat.realAlt)} km</p>
            <p><strong>VEL:</strong> {activeSat.velocity.toFixed(2)} km/s</p>
          </div>
        </div>
      )}

      <div className="roster-panel">
        <div className="roster-header">SATELLITE ROSTER</div>
        <div className="roster-list">
          {satPositions.map((sat, i) => (
            <button 
              key={i} 
              className={`roster-item ${selectedSatName === sat.name ? 'active' : ''}`}
              onClick={() => {
                setSelectedSatName(sat.name);
                if (globeEl.current) {
                  globeEl.current.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: 2 }, 1000);
                }
              }}
            >
              {sat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="watermark-logo">
        <img src="/logo.png" alt="T5S Watermark" />
      </div>

      <Globe
        ref={globeEl}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        objectsData={satPositions}
        objectLat="lat"
        objectLng="lng"
        objectAltitude="alt"
        objectLabel="name"
        onObjectClick={(obj) => {
          setSelectedSatName(obj.name);
          // Optional: auto-rotate to selected satellite
          if (globeEl.current) {
            globeEl.current.pointOfView({ lat: obj.lat, lng: obj.lng, altitude: 2 }, 1000);
          }
        }}
        objectThreeObject={(obj) => {
          const isSelected = selectedSatName === obj.name;
          const geometry = new THREE.SphereGeometry(isSelected ? 2.0 : 1.2, 16, 16);
          const material = new THREE.MeshBasicMaterial({ 
            color: '#ffffff',
            transparent: true,
            opacity: isSelected ? 1 : 0.6
          });
          return new THREE.Mesh(geometry, material);
        }}
      />
    </div>
  );
}

export default App;

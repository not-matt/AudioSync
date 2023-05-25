import React, { useState, useEffect } from 'react';
import { Button, CircularProgress, TextField } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import Dropzone from 'react-dropzone';
import AudioSyncPlugin from './AudioSync.js';
import './App.css';
import bannerImage from './banner.png';

const App: React.FC = () => {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [waveform, setWaveform] = useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [AudioSyncSettings, setAudioSyncSettings] = useState({
    windowSize: 80, // Size of the rolling window and long moving average
    shortWindowSize: 5, // Size of the short moving average
    cooldownDuration: 15, // Total duration of the cooldown in seconds
  });
  const AudioSyncInstance = waveform?.["AudioSync"];

  const updateSettings = (property: string, value: number) => {
    setAudioSyncSettings((prevState) => ({
      ...prevState,
      [property]: value,
    }));
  };

  useEffect(() => {
    AudioSyncInstance?.updateSettings(AudioSyncSettings);
  }, [AudioSyncSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileDrop = (files: string | any[]) => {
    if (!files || files.length === 0) {
      setFile(null);
      setIsLoading(false);
      return
    }
      setFile(files[0]);
      setIsLoading(true);
      setIsPlaying(false);
      const url = URL.createObjectURL(files[0]); 
      if (waveform) {
        waveform.destroy();
      }

      const options = {
        container: '#waveform',
        waveColor: '#f0921b',
        progressColor: '#fd544b',
        loaderColor: '#fd544b',
        cursorColor: 'black',
        minPxPerSec: 25,
        scrollParent: true,
        plugins: [
          AudioSyncPlugin.create({
            container: '#AudioSync',
            settings: AudioSyncSettings,
            labels: true,
            fftSamples: 512,
          }),
        ]
      };

      const wavesurfer = WaveSurfer.create(options);

      // const AudioSyncInstance = wavesurfer["AudioSync"];

      wavesurfer.load(url);
      setWaveform(wavesurfer);
          // Hide loading indicator
    wavesurfer.on('ready', () => {
      setIsLoading(false);
    });
      
    };

    const handlePlayPause = () => {
      if (waveform) {
        waveform.playPause();
        setIsPlaying(!isPlaying);
      }
    };

    return (
      <div className='App'>
         {/* banner image centered */}
        <img src={bannerImage} alt="logo" style={{maxWidth: "20%", margin: "0 auto"}}/>
        {!file ? (
          <Dropzone onDrop={handleFileDrop}>
            {({ getRootProps, getInputProps }) => (
              <div {...getRootProps()} className="dropzone">
              <input {...getInputProps()} />
              <p>Drag and drop an audio file here, or click to browse</p>
            </div>
          )}
        </Dropzone>
      ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', margin: '20px', gap: "10px"}}>
            <Button variant="contained" onClick={handlePlayPause}>
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
              {Object.entries(AudioSyncSettings).map(([key, value]) => (
                <TextField
                  key={key}
                  type="number"
                  label={key}
                  value={value}
                  style={{ width: 200, backgroundColor: 'white' }}
                  onChange={(event) => updateSettings(key, Number(event.target.value))}
                />
              ))}
          </div>
        </div>
      )}
      {isLoading && (
        <div className="loading-indicator">
          <CircularProgress size={24} color="primary" />
          <p>Loading...</p>
        </div>
      )}
      <div id="waveform" />
      <div id="AudioSync" />
    </div>
  );
};

export default App

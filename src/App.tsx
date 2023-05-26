import React, { useState, useEffect } from 'react';
import { Button, CircularProgress, TextField } from '@mui/material';
import WaveSurfer from 'wavesurfer.js';
import Dropzone from 'react-dropzone';
import { debounce } from 'lodash';
import AudioSyncPlugin from './AudioSync.js';
import SliderComponent from './SliderComponent';
import './App.css';
import bannerImage from './banner.png';

const App: React.FC = () => {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [AudioSyncSettings, setAudioSyncSettings] = useState({
    windowSize: 80, // Size of the rolling window and long moving average
    shortWindowSize: 5, // Size of the short moving average
  });
  
  useEffect(() => {
    if (wavesurfer) {
      const AudioSyncInstance = wavesurfer["audiosync"];
      debouncedUpdateSettings(AudioSyncInstance, AudioSyncSettings);
    }
  }, [AudioSyncSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedUpdateSettings = debounce((AudioSyncInstance: any, settings: any) => {
    AudioSyncInstance.updateSettings(settings);
  }, 1000); // Adjust the debounce delay as needed (e.g., 500ms)

  const updateSettings = (property: string, value: number) => {
    setAudioSyncSettings((prevState) => ({
      ...prevState,
      [property]: value,
    }));
  };

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
    if (wavesurfer) {
      wavesurfer.destroy();
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

    const newWavesurfer = WaveSurfer.create(options);

    // Set the new wavesurfer instance
    setWavesurfer(newWavesurfer);
  
    // Load the audio file and update settings
    if (newWavesurfer) {
      // const AudioSyncInstance = newWavesurfer["audiosync"];
      // AudioSyncInstance?.updateSettings(AudioSyncSettings);
  
      newWavesurfer.load(url);
  
      // Hide loading indicator
      newWavesurfer.on('ready', () => {
        setIsLoading(false);
      });
    }
  };

  const handlePlayPause = () => {
    if (!wavesurfer) { return; }
    wavesurfer.playPause();
    setIsPlaying(!isPlaying);
  };

  return (
    <div className='App'>
      {/* banner image centered */}
      <img src={bannerImage} alt="logo" style={{ maxWidth: "20%", margin: "0 auto" }} />
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
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', margin: '20px', gap: "10px" }}>
            <Button variant="contained" onClick={handlePlayPause}>
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <SliderComponent
        windowSize={AudioSyncSettings.windowSize}
        shortWindowSize={AudioSyncSettings.shortWindowSize}
        onSettingsChange={updateSettings}
      />
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
